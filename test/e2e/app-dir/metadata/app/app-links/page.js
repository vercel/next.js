export default function Page() {
  return <p>app links</p>
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
      should_fallback: true,
    },
  },
}
