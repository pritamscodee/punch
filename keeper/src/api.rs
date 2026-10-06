use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use tower_http::cors::CorsLayer;

use crate::{keeper::Keeper, protocol, spl};

type AppState = Arc<Keeper>;

struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        let message = format!("{error:#}");
        let status = if message.contains("not found") {
            StatusCode::NOT_FOUND
        } else if message.contains("cooldown") || message.contains("not a valid") {
            StatusCode::BAD_REQUEST
        } else {
            StatusCode::BAD_GATEWAY
        };
        ApiError(status, message)
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

pub fn router(keeper: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/config", get(config))
        .route("/v1/pacts", get(pacts))
        .route("/v1/pacts/{id}", get(pact))
        .route("/v1/pacts/{id}/settlements", get(settlements))
        .route("/v1/pacts/{id}/settle", post(settle))
        .route("/v1/wallets/{owner}", get(wallet))
        .route("/v1/faucet", post(faucet))
        .layer(CorsLayer::permissive())
        .with_state(keeper)
}

async fn health(State(k): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({ "ok": true, "keeper": k.address().to_string(), "store": k.store.backend() }))
}

async fn config(State(k): State<AppState>) -> ApiResult<serde_json::Value> {
    let decimals = k.rpc.account_data(&k.mint).await?.as_deref().and_then(spl::parse_mint_decimals);
    Ok(Json(json!({
        "settler": k.address().to_string(),
        "mint": k.mint.to_string(),
        "decimals": decimals,
        "symbol": "tSKR",
        "registry": protocol::registry_address().to_string(),
    })))
}

async fn pacts(State(k): State<AppState>) -> ApiResult<Vec<crate::keeper::PactSummary>> {
    let mut out = Vec::new();
    for def in k.discover().await? {
        out.push(k.summary(&def.id).await?);
    }
    Ok(Json(out))
}

async fn pact(State(k): State<AppState>, Path(id): Path<String>) -> ApiResult<crate::keeper::PactSummary> {
    Ok(Json(k.summary(&id.to_uppercase()).await?))
}

async fn settlements(State(k): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<crate::store::Settlement>> {
    Ok(Json(k.store.settlements(&id.to_uppercase(), 60).await?))
}

async fn settle(State(k): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<crate::store::Settlement>> {
    Ok(Json(k.settle_pact(&id.to_uppercase()).await?))
}

async fn wallet(State(k): State<AppState>, Path(owner): Path<String>) -> ApiResult<serde_json::Value> {
    let payouts = k.store.payouts_for(&owner, 200).await?;
    let earned: i64 = payouts.iter().filter(|p| p.to_owner == owner).map(|p| p.amount).sum();
    let lost: i64 = payouts.iter().filter(|p| p.from_owner == owner).map(|p| p.amount).sum();
    Ok(Json(json!({ "owner": owner, "earned": earned, "lost": lost, "payouts": payouts })))
}

#[derive(Deserialize)]
struct FaucetRequest {
    owner: String,
}

async fn faucet(State(k): State<AppState>, Json(body): Json<FaucetRequest>) -> ApiResult<crate::keeper::FaucetResult> {
    Ok(Json(k.faucet(&body.owner).await?))
}
