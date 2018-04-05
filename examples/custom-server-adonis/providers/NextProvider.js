"use strict";

/**
 * adonis-nextjs-provider
 *
 * (c) Omar Khatib <omar@omarkhatib.co.>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

const next = require("next");
const { ServiceProvider } = require("@adonisjs/fold");

class NextProvider extends ServiceProvider {
  /**
   * Register all the required providers
   *
   * @method register
   *
   * @return {void}
   */
  async register() {
    this.app.singleton("Adonis/Addons/Next", app => {
      const dev = app.use("Adonis/Src/Env").get("NODE_ENV") === "development";
      const dir = app.use("Adonis/Src/Helpers").resourcesPath();
      const conf = app.use("Adonis/Src/Config").get("next");
      const Nextapp = next({ dev, dir, conf });
      Nextapp.prepare();
      return Nextapp;
    });
    this.app.alias("Adonis/Addons/Next", "Next");
  }
}

module.exports = NextProvider;
