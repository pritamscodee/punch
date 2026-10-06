-- PUNCH keeper schema. Applied idempotently at startup.
-- The chain is the source of truth; these tables are an index of what the keeper did and saw.

CREATE TABLE IF NOT EXISTS settlements (
    pact_id     TEXT        NOT NULL,
    day         BIGINT      NOT NULL,
    signature   TEXT        NOT NULL,
    slashed     INTEGER     NOT NULL,
    paid        BIGINT      NOT NULL,
    missed      JSONB       NOT NULL,
    punched     JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pact_id, day)
);

CREATE TABLE IF NOT EXISTS payouts (
    id          BIGSERIAL   PRIMARY KEY,
    pact_id     TEXT        NOT NULL,
    day         BIGINT      NOT NULL,
    from_owner  TEXT        NOT NULL,
    to_owner    TEXT        NOT NULL,
    amount      BIGINT      NOT NULL,
    signature   TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_to_owner ON payouts (to_owner);
CREATE INDEX IF NOT EXISTS payouts_from_owner ON payouts (from_owner);

CREATE TABLE IF NOT EXISTS faucet_claims (
    id          BIGSERIAL   PRIMARY KEY,
    owner       TEXT        NOT NULL,
    signature   TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faucet_claims_owner ON faucet_claims (owner, created_at DESC);

CREATE TABLE IF NOT EXISTS verified_signers (
    signature   TEXT        PRIMARY KEY,
    signers     JSONB       NOT NULL
);
