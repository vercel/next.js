import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="HTTPs://google.com">HTTPs</Link>
      <Link href="flatpak+https://dl.flathub.org/repo/appstream/net.krafting.Playlifin.flatpakref">
        flatpak+https
      </Link>
      <Link href="com.apple.tv://">com.apple.tv</Link>
      <Link href="itms-apps://">itms-apps</Link>
    </>
  )
}
