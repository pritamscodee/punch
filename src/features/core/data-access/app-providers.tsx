import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AppIdentity } from '@wallet-ui/react-native-kit'
import { MobileWalletProvider } from '@wallet-ui/react-native-kit'
import { HeroUINativeProvider } from 'heroui-native/provider'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import type { PropsWithChildren, ReactNode } from 'react'

import { ClusterProvider, useAppCluster } from '@/features/cluster/data-access/cluster-provider'
import { createClusterProps } from '@/features/cluster/data-access/create-cluster-props'
import { ShellUiThemeStatusBar } from '@/features/shell/ui/shell-ui-theme-status-bar'

const identity: AppIdentity = { name: 'PUNCH', uri: 'https://github.com/pritamscodee/punch' }
const queryClient = new QueryClient()
const clusterConfig = createClusterProps()

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider config={{ devInfo: { stylingPrinciples: false } }}>
        <QueryClientProvider client={queryClient}>
          <ClusterProvider store={clusterConfig.store}>
            <AppWalletProviders>{children}</AppWalletProviders>
          </ClusterProvider>
        </QueryClientProvider>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  )
}

function AppWalletProviders({ children }: PropsWithChildren) {
  const { cluster } = useAppCluster()

  return (
    <MobileWalletProvider cluster={cluster} identity={identity}>
      <View className="flex-1 bg-[#F2F2EF] dark:bg-[#14161A]">
        {children}
        <ShellUiThemeStatusBar />
      </View>
    </MobileWalletProvider>
  )
}
