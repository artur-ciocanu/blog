const fs = require("fs");
const fetch = require("node-fetch");
const MEDIUM_USER_ID = process.env.MEDIUM_USER_ID;
const MEDIUM_TOKEN = process.env.MEDIUM_TOKEN;
const BASE_PATH = __dirname + "/../target-odd-serverless/part-1";
const API_URL = `https://api.medium.com/v1/users/${MEDIUM_USER_ID}/posts`;

const validateRequired = (value, message) => {
  if (value === undefined) {
    throw new Error(message);
  }
};

const getPublishingStatus = () => {
  if (process.argv.length === 2) {
    return "draft";
  }

  const publishingStatus = process.argv[2];

  if (publishingStatus === "--public") {
    return "public";
  }

  return "draft";
}

const getFileContent = fileName => {
  return fs.readFileSync(`${BASE_PATH}/${fileName}`).toString("utf-8");
}

const createPost = publishStatus => {
  return {
    title: getFileContent("title.txt"),
    contentFormat: "markdown",
    content: getFileContent("index.md"),
    tags: JSON.parse(getFileContent("tags.json")),
    publishStatus
  }  
}

const publish = data => {
  const options = {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MEDIUM_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  }

  return fetch(API_URL, options);
}

const main = () => {
  validateRequired(MEDIUM_USER_ID, "MEDIUM_USER_ID environment variable is missing");
  validateRequired(MEDIUM_TOKEN, "MEDIUM_TOKEN environment variable is missing");

  const publishingStatus = getPublishingStatus();
  const post = createPost(publishingStatus);

  publish(post)
  .then(response => response.json())
  .then(console.log)
  .catch(console.error)
}

main();
