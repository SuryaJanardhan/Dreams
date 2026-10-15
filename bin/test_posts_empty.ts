import { failureInfo } from "../src/compat/errors.js";
import axios = require("axios");

(async () => {
  try {
    console.log("Testing posts workflow with empty body...");
    const response = await axios.post(
      "http://localhost:3000/posts-workflow",
      {},
    );
    console.log("Success:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    const caughtDetails0 = failureInfo(error);

    console.error(
      "Error:",
      caughtDetails0.response?.data || caughtDetails0.message,
    );
  }
})();
