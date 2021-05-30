# Introduction
This is the third part in our series that covers `Adobe Target NodeJS SDK` with `On-Device Decisioning` capabilities and how to run it in a serverless/edge compute environment. In this third installment we will be covering `Cloudflare Workers`.

Series list:
- part 1 - covers Akamai Edge Workers and Adobe Target NodeJS SDK
- part 2 - covers AWS Lambda@Edge and Adobe Target NodeJS SDK
- **part 3 - covers Cloudflare Workers and Adobe Target NodeJS SDK**

# Step by step guide
As mentioned in the first two articles, we love `Terraform` and we use it heavily for Infrastructure Automation. In this article we will show how you can leverage `Terraform` and `Adobe Target NodeJS SDK` to create and deploy a `Cloudflare Worker`.

`Cloudflare Worker` is a great technology if you intend to run some compute as close as possible to end users. `Cloudflare` has point of presence in 200+ locations across the globe which ensures that you can have your logic running close to your customers. To make sure we have a repeatable process, just like in previous articles, we will be leveraging `Terraform`.

Before we begin there are a few prerequisites:
- `Cloudflare account` - you will need a valid `Cloudflare` account and credentials. `Terraform` relies on these credentials.
- `Terraform` - we will use it to create all the required `Cloudflare` resources. Please check the official `Hashicorp` documentation on how to install `Terraform` on your particular OS. In this article we will be showing examples using Mac OS X.
- `NodeJS` - we will use `NodeJS` to get the `Adobe Target NodeJS SDK` dependency as well as using `NPM` to package the JavaScript and prepare it for `Cloudflare Worker`.

## Creating the zone
In order to use `Cloudflare Worker` we need to have a zone in place. A zone is similar to a domain and it is required to be able to work with `Cloudflare`. Here is the `Terraform` code required to create a zone:
```hcl
resource "cloudflare_zone" "zone" {
  zone = var.zone_name
}
```
As we can see it is pretty straightforward to create a zone. We can provide other arguments to the the `cloudflare_zone` resource like `plan`, `type`, etc but what we have is enough for our sample.

## Creating the worker script
Once we have a zone, the next step is to create the worker script. In order to create the worker script we will need to get the `Adobe Target NodeJS SDK` dependency. This can be achieved using:
```bash
$ npm i @adobe/target-nodejs-sdk -P
```
After all the NPM dependencies have been installed, we can proceed with the sample code.
```JavaScript
import TargetClient from "@adobe/target-nodejs-sdk";
import RULES from "./rules";

const createTargetClient = () => {
  return new Promise(resolve => {
    const result = TargetClient.create({
      client: "targettesting",
      organizationId: "74F652E95F1B16FE0A495C92@AdobeOrg",
      decisioningMethod: "on-device",
      artifactPayload: RULES,
      logger: console,
      events: {
        clientReady: () => resolve(result)
      }
    });
  });
};

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const headers = {
    headers: { 
      "content-type": "application/json"
    }
  };
  const body = await request.json();
  const response = await createTargetClient()
  .then(client => client.getOffers({request: body}))
  .then(deliveryResponse => deliveryResponse.response)
  .catch(error => error);

  return new Response(JSON.stringify(response), headers);
}
```
NOTE: The `RULES` constant references the `On-Device Decisioning` artifact `rules.json` file. This file can be downloaded from `https://assets.adobetarget.com/<client code>/production/v1/rules.json`. This file will be available only after you have enabled `On-Device Decisioning` for your `Adobe Target` account.

As in all the previous articles we have configured `Adobe Target NodeJS SDK` instance to use `On-Device Decisioning` to avoid hitting `Target Edge` network.

The `Cloudflare Worker` environment is quite similar to a browser `ServiceWorker`, so we can't really use `Adobe Target NodeJS SDK` as is. We will have to make sure that the worker script is bundled for the "browser" environment, instead of default NodeJS runtime. We will be leveraging `Rollup` and it's `resolve` plugin to make sure that we package everything neatly for the worker environment. More details and the necessary configurations for `Rollup` can be found in [this](https://github.com/artur-ciocanu/odd-cloudflare-workers/tree/main/script) repo.

## Creating the worker route
So far we have created the zone and the worker script. To be able access the worker via HTTP we have too create an worker route. Using `Terraform` this can be accomplished using this script:
```hcl
resource "cloudflare_worker_route" "route" {
  zone_id = cloudflare_zone.zone.id
  pattern = var.route_pattern
  script_name = cloudflare_worker_script.script.name
}
```
As we can see here we are using the `zone ID` and `script name`. Another important piece is the `pattern` which in the simplest case can represent just the URL path that will be used to execute the worker script.

## Testing it out
If everything was setup properly, then you should have an endpoint on your configured domain that once hit will invoke the newly created `Cloudflare Worker`. To make sure that everything is running properly we can use `cURL`:
```bash
curl --location --request POST 'https://odd.bpack.workers.dev/rest/v1/personalization' \
--header 'Content-Type: application/json' \
--data-raw '{      
  "execute": {
    "pageLoad": {}
  }
}
'
```
Here are I am using a default `workers.dev` domain for demo purposes. The output of the `cURL` command would look something like this:
```JSON
{
  "status": 200,
  "requestId": "9a08adf5a9d04d9bb014f810facee8bb",
  "id": {
      "tntId": "3665f03437a64ce886e0f1d4a95bb4dc.37_0"
  },
  "client": "targettesting",
  "execute": {
    "pageLoad": {
      "options": [
        {
          "type": "html",
          "content": "<div>Srsly, who dis?</div>",
          "responseTokens": {
            "activity.id": 125880,
            "activity.name": "[unit-test] target-global-mbox browsers",
            "experience.id": 3,
            "experience.name": "Experience A",
            "offer.id": 246867,
            "offer.name": "/_unit-test_target-global-mboxbrowsers/experiences/3/pages/0/zones/0/1612389131041",
            "option.id": 5,
            "option.name": "Offer5",
            "activity.decisioningMethod": "on-device"
          }
        },
        {
          "type": "html",
          "content": "<div>lion</div>",
          "responseTokens": {
            "activity.id": 125884,
            "activity.name": "[unit-test] target-global-mbox creatures",
            "experience.id": 2,
            "experience.name": "Experience C",
            "offer.id": 246876,
            "offer.name": "/_unit-test_target-global-mboxcreatures/experiences/2/pages/0/zones/0/1612389727806",
            "option.id": 4,
            "option.name": "Offer4",
            "activity.decisioningMethod": "on-device"
          }
        }
      ]
    }
  }
}
```

# Closing thoughts
I real enjoyed working with `Cloudflare Worker`. The `Cloudflare` `Terraform` provider covers everything that I need and it was really, really easy to have everything up and running, even for a newcomer like myself.

I should highlight that I haven't used `Cloudflare Wrangler`. For anyone doing serious `Cloudflare Worker` development, `Wrangler` should be the go to tool. In my case the development flow was something like:
1. adjust worker script
2. run `NPM` build script
3. run `Terraform` to upload the new bundle
4. run `cURL`
5. if something is not quite OK, go to `1.`

But even with this "primitive" workflow it took me half an hour to have a working example. This includes creating the `Terraform` scripts, `Rollup` configuration and the sample worker script. It was quite a surprise to see how quickly I can change the code, upload it to `Cloudflare` network and see it running via `cURL`, literally in a matter of seconds. This is in stark contrast to `Akamai EdgeWorkers` which required many minutes until I could see the changes on the staging and production networks.

Another thing which allowed me to move quickly, is the fact that `Cloudflare Worker` has a programming model similar to a `ServiceWorker`. Anyone who has done any `WebWorker` or `ServiceWorker` development will feel at home. For the most part standard Web APIs like `fetch`, `Cache API`, etc works as you would expect, which cuts down, significantly, the amount of "new" stuff you have to learn. This was a very smart decision made by `Cloudflare Worker` team.

Overall I am very pleased with the result and the demo that I have managed to build. I really enjoyed working with `Cloudflare Worker`. Although it looks deceptively simple, `Cloudflare Workers` are immensely powerful and can do a lot for you. With the latest additions like:
- Workers KV
- Durable Objects
- Scheduled Event
- Workers Unbound

The possibilities are limitless and constrained only by our own imagination.

# Resources
- Source code - https://github.com/artur-ciocanu/odd-cloudflare-workers
- Adobe Target - https://business.adobe.com/products/target/adobe-target.html
- Adobe Experience Platform - https://business.adobe.com/products/experience-platform/adobe-experience-platform.html
- Adobe Target NodeJS SDK - https://adobetarget-sdks.gitbook.io/docs/sdk-reference-guides/nodejs-sdk
- Terraform - https://www.terraform.io/
- Cloudflare provider - https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs
- Cloudflare Wrangler - https://developers.cloudflare.com/workers/cli-wrangler
