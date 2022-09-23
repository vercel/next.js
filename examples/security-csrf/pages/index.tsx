import type { NextPage } from "next";

const Home: NextPage = () => {
  // this function takes in a 'key' which is the key of the cookie and returns the associated value
  function getCookie(key: String) {
    if (typeof window !== "undefined") {
      var match = document.cookie.match(new RegExp("(^| )" + key + "=([^;]+)"));
      if (match) return match[2];
    }
  }

  // calling the getcookie function to retrieve the csrf key's value
  const csrf = getCookie("csrf");

  // onsubmit we are validating the csrf cookie and the csrf hidden input match
  const validate = async (e: any) => {
    e.preventDefault();

    const csrfInput = (document.getElementById("csrf")! as HTMLInputElement)
      .value;

    if (csrf === csrfInput) {
      // double submit passed
      return console.log("csrf matches");
    } else {
      // double submit failed
      return console.log("csrf does not match");
    }
  };

  return (
    <>
      <div>
        <h1>security-csrf example</h1>
        <p>
          this example showcases how stateless csrf mitigation works using the{" "}
          <a
            href="https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#double-submit-cookie"
            target="_blank"
          >
            double submit cookie
          </a>{" "}
          method.
        </p>

        <p>
          on any page request, `middleware.ts` will check for a `csrf` cookie. it
          will create one if one is not present. this cookie can now be used on
          any html form to provide an extra step of validation.
        </p>
        <p>
          as an example the below form is looking for an email, that also
          inlcudes a hidden input to include the `csrf` cookie which is then
          sent with the request.
        </p>
        <p>
          onSubmit will trigger a script to validate the csrf param was
          included, and matches the one set by `middleware.ts`. check the
          console to see the output.
        </p>
      </div>

      <form onSubmit={validate} method="post">
        <input
          id="email"
          placeholder="email@example.org"
          type="email"
          autoComplete="email"
          required
        />
        <input type="hidden" id="csrf" name="csrf token" value={csrf} />
        <input type="submit" value="Submit" />
      </form>
    </>
  );
};

export default Home;
