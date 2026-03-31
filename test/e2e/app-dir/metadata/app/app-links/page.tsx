export default function Page() {
  return 'app links'
}

export const metadata = {
  appLinks: {
    ios: {
      url: 'https://example.com/ios',
      app_store_id: 'app_store_id',
    },
    android: {
      package: 'com.example.android/package',
      app_name: 'app_name_android',
    },
    web: {
      url: 'https://example.com/web',
      should_fallback: true,
    },
  },
}
