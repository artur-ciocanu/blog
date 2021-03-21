# Target On Device Decisioning and edge computing

## Background
Adobe Target always provided best in class experimentation and personalization. Our edge network is geographically distributed and we have points of presence in different parts of the world like US, Europe, APAC, etc. This allows to be closer to our customers users, but sometimes this is not enough since fundamentally Target always required a network call to retrieve personalized content.

We always knew that this is could be problematic for some of our customers who are looking for near zero latency for experimentation and personalization. In November 2020 Adobe Target launched NodeJS and Java SDK with On-Device Decisioning capabilities. In a nutshell On-Device Decisioning allows you to evaluate Target activities on-device avoiding a network roundtrip. For more details please check the official documentation [here](https://experienceleague.adobe.com/docs/target/using/implement-target/server-side/on-device-decisioning.html?lang=en#implement-target).

Target On-Device Decisioning while great for server side use cases where you can use one of our SDKs like [NodeJS](https://github.com/adobe/target-nodejs-sdk), [Java](https://github.com/adobe/target-java-sdk) and soon [Python](https://github.com/adobe/target-python-sdk) and [.NET](https://github.com/adobe/target-dotnet-sdk) can also be used in a serverless setup.

Java and C# are awesome languages, but usually in a serverless setup, we prefer something a little bit more lightweight like NodeJS or Python. We already mentioned that Adobe Target has an edge network, but it is incomparable to Edge Computing Platforms aka CDNs like AWS Cloudfront, Cloudflare or Akamai.

I this three part series we will cover how anyone could use Adobe Target NodeJS SDK to run experimentations and personalization on edge compute platforms.

The series is comprised of three parts:
- part 1 - covers AWS Lambd@Edge and Target NodeJS SDK
- part 2 - covers Cloudflare Workers and Target NodeJS SDK
- part 3 - covers Akamai Edge Workers and Target NodeJS SDK

## AWS Lambda@Edge and Target NodeJS SDK
