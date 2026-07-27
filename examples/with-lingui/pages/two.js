import { Trans } from "@lingui/macro";
import Link from "next/link";

const Two = () => (
  <div>
    <Trans>Page two.</Trans>{" "}
    <Link href="/">
      <Trans>Back home</Trans>
    </Link>
    <br />
  </div>
);

export default Two;
