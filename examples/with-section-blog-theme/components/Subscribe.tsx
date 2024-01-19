export function Subscribe() {
  return (
    <section className="bg-white dark:bg-gray-900 mb-10 ">
      <div className="container py-10 mx-auto flex flex-col  items-center justify-between">
        <h2 className="mt-7 text-2xl font-semibold tracking-tight text-gray-800 xl:text-3xl dark:text-white">
          {" "}
          Join us and get the update from anywhere.
        </h2>

        <div className="lg:mt-0 mx-auto">
          <div className="flex flex-col sm:flex-row gap-4 justify-around">
            <input
              id="email"
              type="text"
              className="px-4 py-2 text-gray-700 bg-white border border-gray-200 rounded-lg sm:mx-2 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600 focus:border-blue-400 dark:focus:border-blue-400 focus:ring-blue-300 focus:outline-none focus:ring focus:ring-opacity-40"
              placeholder="Email Address"
            />

            <button className="px-6 py-2 text-sm tracking-wide text-white capitalize transition-colors duration-300 transform bg-blue-600 rounded-lg focus:ring focus:ring-blue-300 focus:ring-opacity-80 fo sm:mx-2 hover:bg-blue-500 focus:outline-none focus:bg-blue-500">
              Get Started
            </button>
          </div>

          <p className="mt-3 text-sm text-gray-500 dark:text-gray-300">
            Attention! Offer expires in 30 days. Make sure not to miss this
            opportunity
          </p>
        </div>
      </div>
    </section>
  );
}
