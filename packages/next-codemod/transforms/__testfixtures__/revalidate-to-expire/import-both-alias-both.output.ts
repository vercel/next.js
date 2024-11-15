import { expirePath as expirePathAlias, expireTag as expireTagAlias } from "next/cache";

export async function GET() {
  expirePathAlias("next");
  expireTagAlias("next");
  expirePathAlias("next");
  expireTagAlias("next");
}
