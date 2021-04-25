# Introduction
`Adobe Target` always provided best in class experimentation and personalization. Our edge network is geographically distributed and we have points of presence in different parts of the world like `US`, `Europe`, `APAC`, etc. This allows us to be closer to our customers users, but sometimes this is not enough since fundamentally Target always required a network call to retrieve personalized content.

We always knew that this is could be problematic for some of our customers who are looking for near zero latency for experimentation and personalization. In November 2020 Adobe Target launched NodeJS SDK and Java SDK with On-Device Decisioning capabilities. In a nutshell On-Device Decisioning allows you to evaluate Target activities on-device avoiding a network roundtrip. For more details please check the official documentation [here](https://adobetarget-sdks.gitbook.io/docs/on-device-decisioning/introduction-to-on-device-decisioning).

Adobe Target On-Device Decisioning while great for server side use cases where you can use one of our SDKs like [NodeJS](https://github.com/adobe/target-nodejs-sdk), [Java](https://github.com/adobe/target-java-sdk) and soon [Python](https://github.com/adobe/target-python-sdk) and [.NET](https://github.com/adobe/target-dotnet-sdk) can also be used in a serverless setup.

Java and C# are awesome languages, but usually in a serverless setup, we prefer something a little bit more lightweight like NodeJS or Python. We already mentioned that Adobe Target has an edge network, but it is incomparable to Edge Computing Platforms aka CDNs like AKamai, AWS Cloudfront or Cloudflare.

I this three part series we will cover how anyone could use Adobe Target NodeJS SDK to run experimentation and personalization on an edge compute platform.

Series list:
- **part 1 - covers Akamai Edge Workers and Adobe Target NodeJS SDK**
- part 2 - covers AWS Lambd@Edge and Adobe Target NodeJS SDK
- part 3 - covers Cloudflare Workers and Adobe Target NodeJS SDK

# Step by step guide
At `Adobe Target` we are strong proponents of automation and `Infrastructure as Code`, that's why we love `Hashicorp Terraform`. For us `Terraform` provides the right amount of declarative vs imperative code and it has enough escape hatches in case something is missing.

Recently `Akamai` launched `Akamai EdgeWorkers`. This is a new offering from `Akamai` that allows us to create small pieces of logic that can be distributed worldwide and executed in more than 2000+ locations. While we can always Akamai Control Center to setup everything, we will be leveraging `Terraform` and `Akamai CLI` to ensure we have all the steps codified in `Terraform` scripts or `Akamai CLI` commands. 

Before we begin there are a few prerequisites:
- `Akamai access` - you will need to have access to Akamai and a product that support `EdgeWorkers` such as `Ion`. Also you should have access to `Akamai IAM` to be able to create an API Client. `Terraform` relies on API Client to be able to authenticate all the API calls during resource provisioning. 
- `Akamai CLI` with `EdgeWorkers` package - we will use it to create `EdgeWorkers` required configurations.
- `Terraform` - we will use it to create all the required `Akamai` resources. Please check the official `Hashicorp` documentation on how to install `Terraform` on your particular OS. In this article we will be showing examples using `Mac OS X`.
- `NodeJS` - we will use NodeJS to get the `Adobe Target NodeJS SDK` dependency as well as using `NPM` to package the JavaScript and prepare it for `Akamai EdgeWorkers`.

Most of the resources that we will provision in `Akamai` require:
- `group ID`
- `contract ID`
- `product ID`
- `product name`
So it is recommended that you copy these values somewhere so you have them handy. If you can't find these values, please talk to your `Akamai` account representative.

## Creating Akamai EdgeWorker ID
There are a couple of resources required in order to use `Akamai EdgeWorkers` and expose it via an HTTP endpoint. Here is the list:
- `Akamai EdgeWorker ID`
- `Akamai property`

To create an `Akamai EdgeWorker ID` we will use `Akamai CLI`. Here is the command to create an `EdgeWorker ID`:
```bash
$ akamai ew create-id <group ID> <EdgWorker Name>
```
NOTE: Depending on your Akamai setup you might get a menu where you'll have to select the contract you want to use. Also you might have to select the resource tier for `EdgeWorkers`, just follow the `Akamai CLI` instructions it is pretty self-explanatory. 

Once everything is has been executed successfully you should see the `EdgeWorker ID` being displayed in a table similar to this one:
```bash
---------------------------------------------------------------
--- Created new EdgeWorker Identifier: ------------------------
---------------------------------------------------------------
edgeWorkerId  name              groupId      resourceTierId
------------  ----------------  -------      ------------------
5628          <EdgWorker Name>  <group ID>   <resource tier ID>  
```
NOTE: You'll have to save the `EdgeWorker ID` since it will be used later in the `Terraform` scripts.

## Creating EdgeWorker debug secret
While developing with `Akamai EdgeWorkers` it is extremely important to be able to troubleshoot what is happening behind the scenes. For this we will need to generate a debug secret. Here is the `Akamai CLI` command generate an `EdgeWorker` debug secret:
```bash
$ akamai ew secret
```
Once the secret is generated we will have to copy it to `Terraform` variables file. So we could reference the secret in `Akamai Property` rules.

## Creating Content Provider Code
Once we have the `EdgeWorker ID` setup, the next step is to create a Content Provider code aka CP code. This resource is required to be able to create an `Akamai Property`.

The `Terraform` script to create a CP code looks like this:
```hcl
resource "akamai_cp_code" "cp_code" {
  name        = var.cp_code_name
  contract_id = var.contract_id
  group_id    = var.group_id
  product_id  = var.product_id
}
```
As you can see, here are using `Terraform` variables. This allows us to externalize all the values that might vary between different environments like staging vs production.

## Creating Edge Hostname
The next resource that is required for an `Akamai Property` is the edge hostname. Here is the `Terraform` script to create an edge hostname.

```hcl
resource "akamai_edge_hostname" "hostname" {
  product_id    = var.product_id
  contract_id   = var.contract_id
  group_id      = var.group_id
  edge_hostname = var.edge_hostname
  ip_behavior   = "IPV6_COMPLIANCE"
  certificate   = var.certificate_enrollment_id
}
```
Here is we use the same list of required `IDs` like product, contract and group. Besides this we also need a certificate enrollment ID. `EdgeWorkers` can be invoked ONLY via HTTPS, hence we need a certificate enrollment ID.

## Creating Property Rules
An `Akamai Property` can not be created without property rules. Property rules contain details like caching configurations, origin address, different behaviors etc.

`Terraform` `Akamai` provider has a helper `data` element named `akamai_property_rules_template` that allows us to customize property rules via templates and variables. Here is the `Terraform` script for our property that references the `EdgeWorker ID` and `EdgeWorker debug secret` described earlier:
```hcl
data "akamai_property_rules_template" "rules" {
  template_file = abspath("${path.root}/property-snippets/rules.json")

  variables {
    name  = "edge_worker_id"
    type  = "string"
    value = var.edge_worker_id
  }

  variables {
    name  = "edge_worker_debug_secret"
    type  = "string"
    value = var.edge_worker_debug_secret
  }

  variables {
    name  = "cp_code_id"
    type  = "number"
    value = replace(akamai_cp_code.cp_code.id, "cpc_", "")
  }

  variables {
    name  = "cp_code_name"
    type  = "string"
    value = var.cp_code_name
  }

  variables {
    name  = "origin_hostname"
    type  = "string"
    value = var.origin_hostname
  }

  variables {
    name  = "product_name"
    type  = "string"
    value = var.product_name
  }

}
```
As we can see we have a couple of variables that are required in property rules. We already mentioned we need `EdgeWorker ID` and `EdgeWorker debug secret`, we also need to add `origin hostname`, `product name`, `CP code name` and `CP code ID`. `CP code ID` has to be adjusted a little bit, since by default the IDs returned by `Akamai` have prefixes. For `CP code ID` it is `cpc_`, hence we leverage `Terraform` `replace` to get rid of `cpc_` and get the real `CP code ID`.

## Creating Property
Finally, when we have `EdgeWorker` details, `CP code`, `edge hostname` and `property rules` we can create an `Akamai property`. Here is the `Terraform` script to create it:
```hcl
resource "akamai_property" "property" {
  name        = var.property_name
  product_id  = var.product_id
  contract_id = var.contract_id
  group_id    = var.group_id

  hostnames {
    cname_from             = var.external_hostname
    cname_to               = var.edge_hostname
    cert_provisioning_type = "DEFAULT"
  }

  rule_format = "v2020-03-04"
  rules       = data.akamai_property_rules_template.rules.json
}
```
Nothing extraordinary here, we are using the same required `IDs` like group, contract, product and we also reference the property rules template resource to get the final rules `JSON` value for this property.

## Creating and Activating EdgeWorker Bundle
Now that we have all the resources provisioned, we can look into how we can create an `Akamai EdgeWorker bundle`. 

From bundling perspective `Akamai EdgeWorkers` requires the following:
- `main.js` - this is the `EdgeWorker` entry point.
- `bundle.json` - contains metadata related to `EdgeWorker` like version and description. For every code change we will have to update the version, otherwise we won't be able to upload the code.
- `tgz` archive - this the actual bundle that contains `main.js` and `bundle.json` and is uploaded to `Akamai` network.

To automate the bundling process we will be using `NPM` and `Rollup` bundler. `NPM` will allow us to get all the required dependencies and `Rollup` will make sure that we bundle everything into a single `main.js` file. We will use `NPM scripts` to automate all of build and bundling the steps. To build the final `Akamai EdgeWorker` bundle we will execute:
```bash
$ npm run build
```
This will create a `tgz` archive under `dist` folder.

To upload the newly created bundle we will use `Akamai CLI` and run the following command:
```bash
$ akamai ew upload --bundle=<path to tgz archive> <edge worker ID>
```

Once a new version of the bundle has been uploaded we can activate it using `Akamai CLI` and running this command:
```bash
$ akamai ew activate <edge worker iD> <network> <version>
```
NOTE: It is important to first activate the new version on a staging environment and ensure that everything is looking good and then activate it on production network.

## EdgeWorker Script
`Akamai EdgeWorker` environment is based on `v8` engine, so we can use most of the modern JavaScript constructs like `async/await`, `Promise`, etc. However there are some limitations, all these are covered [here](https://learn.akamai.com/en-us/webhelp/edgeworkers/edgeworkers-user-guide/GUID-F709406E-2D67-4996-B619-91E90F04EDF2.html).

When starting to develope using `Akamai EdgeWorkers` it is important to decide which event handler we want to implement. More details around event handlers can be found [here](https://learn.akamai.com/en-us/webhelp/edgeworkers/edgeworkers-user-guide/GUID-65ED3146-E158-4443-B591-35E0D3B58DA2.html).

For the sample code I have decided to use `responseProvider`, since I want the `EdgeWorker` code to react to incoming HTTP GET request and build an HTTP response. We will be using the `Adobe Target NodeJS SDK`, so we'll have to get the dependency via `NPM` using:
```bash
$ npm i @adobe/target-nodejs-sdk -P
``` 

The sample code looks like this:
```JavaScript
import { httpRequest } from "http-request";
import { createResponse } from "create-response";
import { logger } from "log";
import TargetClient from "@adobe/target-nodejs-sdk";
import RULES from "./rules";

const STATUS = 200;
const HEADERS = {
  "Content-Type": ["application/json"]
};

const createTargetClient = () => {
  return new Promise(resolve => {
    const result = TargetClient.create({
      client: "<client code>",
      organizationId: "<organization ID>",
      decisioningMethod: "on-device",
      artifactPayload: RULES,
      pollingInterval: 0, // "0" prevents polling, if artifactPayload is provided
      targetLocationHint: "<location hint>", // prevent cluster discovery
      logger: logger, // use Akamai EdgeWorker provided logger
      fetchApi: httpRequest,
      events: {
        clientReady: () => resolve(result)
      }
    });
  });
};

export async function responseProvider(request) {
  const deliveryRequest = {      
    execute: {
      mboxes: [{
        index: 0,
        name: "mbox-params",
        parameters: {
          foo: "bar"
        }
      }]
    }
  };

  logger.log("Received request", JSON.stringify(request));

  const client = await createTargetClient();
  const { response } = await client.getOffers({ request: deliveryRequest });

  logger.log("Sending response", JSON.stringify(response));

  return createResponse(STATUS, HEADERS, JSON.stringify(response));
}
```
NOTE: The `RULES` constant references the `On-Device Decisioning` artifact `rules.json` file. This file can be downloaded from `https://assets.adobetarget.com/<client code>/production/v1/rules.json`. This file will be available only after you have enabled `On-Device Decisioning` for your `Adobe Target` account.

It is important to highlight that `Akamai EdgeWorkers` environment is a little bit different from NodeJS or browser, hence when using `Rollup` we have to opt-in to bundle all the code for the browser environment and make sure that all the global objects like `window`, `global` or anything like that are declared and properly initialized to avoid runtime errors.

The sample `Akamai EdgeWorker` leverages the `Rollup` `banner` configuration to prepend to the final JavaScript file all the necessary declarations like `window`, etc. Here is the sample `Rollup` `banner` text:
```JavaScript
// All these are required to ensure everything runs smoothly in an Akamai EdgeWorker
var window = {};
var TextDecoder = function() {};
var setTimeout = function(callback) { callback(); };
``` 

## Testing it out
If everything was setup properly, then you should have an `Akamai property` configured with `Akamai EdgeWorker` behavior that can be accessed at a specific domain name. Using the domain name you could run a simple `cURL` command to check that everything is looking good. Here is a sample:
```bash
curl --location --request GET 'https://target-odd-dev.test.edgekey.net/v1/personalization' \
--header 'Pragma: akamai-x-ew-debug' \
--header 'Pragma: akamai-x-ew-debug-rp' \
--header 'Akamai-EW-Trace: st=1618421957~exp=1618425557~acl=/*~hmac=6b8f31571c646d01ad5155407775f5b5b07ef237848164f745ca86c3e938dad5'
```
This will execute an `Akamai EdgeWorker` that will run `Adobe Targte NodeJS SDK` `On-Device Decisioning`.
The output would look something like this:
```JSON
{
  "status": 200,
  "requestId": "2e412eb3dc594a198030097772fd1a8c",
  "id": {
      "tntId": "2b6b95529c8f418f877504cca96710dc.34_0"
  },
  "client": "targettesting",
  "execute": {
    "mboxes": [
      {
        "name": "mbox-params",
        "options": [
          {
            "type": "json",
            "content": {
              "foo": "bar",
              "isFooBar": true,
              "experience": "A"
            },
            "responseTokens": {
              "activity.id": 125874,
              "activity.name": "[unit-test] mbox-params",
              "experience.id": 0,
              "experience.name": "Experience A",
              "offer.id": 246852,
              "offer.name": "/_unit-test_mbox-params/experiences/0/pages/0/zones/0/1612386851217",
              "option.id": 2,
              "option.name": "Offer2",
              "activity.decisioningMethod": "on-device"
            }
          }
        ],
        "index": 0
      }
    ]
  }
}
```
Normally we would stop here, but we all know that nothing works the way we want the first time. So it is crucial to have proper troubleshooting tools at our disposal. Thankfully `Akamai EdgeWorker` allows you to get the logs that we write in the JavaScript code via HTTP headers. In order to enable this capability we have to add a few debug HTTP headers to the outgoing request, these are:
- `Pragma: akamai-x-ew-debug`
- `Pragma: akamai-x-ew-debug-rp` - used for `responseProvider`
- `Aakamai-EW-Trace: st=......` - contains the HMAC used for handshaking to ensure request is authorized to get the logs.

`Akamai CLI` for `EdgeWorkers` has a convenient command named `auth` that allows us to generate the value required for `Akamai-EW-Trace`. The `auth` command needs the `Akamai EdgeWorker debug secret` that we have setup earlier. To create the HMAC for `Akamai-EW-Trace` we can use this command:
```bash
$ akamai ew auth <debug secret>
```
The output would look something like this:
```bash
Akamai-EW-Trace: st=1619377928~exp=1619378828~acl=/*~hmac=<generated HMAC>
```

When enabling debug headers, our sample response will look like this:
```

--yguZ36SBeirJVeeQGLblT7
content-type: application/json
content-disposition: form-data; name="response-provider-body"

{"status":200,"requestId":"20605b03b80d47c9be5351b650d2630b","id":{"tntId":"80d1734703214647967607a938f8e1fe.34_0"},"client":"targettesting","execute":{"mboxes":[{"name":"mbox-params","options":[{"type":"json","content":{"foo":"bar","isFooBar":true,"experience":"B"},"responseTokens":{"activity.id":125874,"activity.name":"[unit-test] mbox-params","experience.id":1,"experience.name":"Experience B","offer.id":246851,"offer.name":"/_unit-test_mbox-params/experiences/1/pages/0/zones/0/1612386851213","option.id":3,"option.name":"Offer3","activity.decisioningMethod":"on-device"}}],"index":0}]}}
--yguZ36SBeirJVeeQGLblT7
content-type: text/plain;charset=UTF-8
content-disposition: form-data; name="stream-trace"

X-Akamai-EdgeWorker-ResponseProvider-Info: ew=5536 v0.24:target-odd-edgeworker; status=Success; status_msg=-; wall_time=35.778; cpu_time=28.696
X-Akamai-EdgeWorker-ResponseProvider-Log: D:main.js:1635 Received request {"sandboxId":null,"cpCode":1171899,"url":"/v1/personalization","query":"","scheme":"https","path":"/v1/personalization","method":"GET","host":"target-odd-dev.test.edgekey.net","userLocation":{"continent":"EU","country":"MD","region":"","zipCode":"","city":"CHISINAU"},"device":{"isMobile":false,"isWireless":false,"isTablet":false}}|D::1642 Sending response {"status":200,"requestId":"20605b03b80d47c9be5351b650d2630b","id":{"tntId":"80d1734703214647967607a938f8e1fe.34_0"},"client":"targettesting","execute":{"mboxes":[{"name":"mbox-params","options":[{"type":"json","content":{"foo":"bar","isFooBar":true,"experience":"B"},"responseTokens":{"activity.id":125874,"activity.name":"[unit-test] mbox-params","experience.id":1,"experience.name":"Experience B","offer.id":246851,"offer.name":"/_unit-test_mbox-params/experiences/1/pages/0/zones/0/1612386851213","option.id":3,"option.name":"Offer3","activity.decisioningMethod":"on-device"}}],"index":0}]}}

--yguZ36SBeirJVeeQGLblT7--
```
NOTE: In this response we see JSON response, along with all the logs we have added to our `Akamai EdgeWorker` script. This approach can be invaluable when trying to debug `Akamai EdgeWorkers`.

## Closing thoughts
In this article we have proved that `Adobe Target NodeJS SDK` can be used successfully from an `Akamai EdgeWorker`. We have seen how `Terraform` and `Akamai CLI` can be used to create the necessary `Akamai` resources to be able to invoke the `Akamai EdgeWorker` using a simple HTTP GET.

While I am very pleased with the result, there are a few roadblocks and things I wish we could improve in the future:
- `Terraform` `Akamai` provider recently released `v1`. Most of my previous knowledge about `Akamai` provider wasn't really applicable and I had redo most of the property configuration from scratch. Thankfully the provider documentation is really good, but it still required some trial and error.
- `Terraform` `Akamai` provider doesn't know about `EdgeWorkers`. My guess is because this is a recent product and the provider hasn't been updated. It's not that bad, since we can use `Akamai CLI`, but ideally we should keep everything under one single tool.
- `Akamai EdgeWorkers` debugging/troubleshooting could be better. At this point in time, the only way to debug anything in `Akamai EdgeWorkers` is to use log statements. It works, but it is slow, since every code change requires uploading the bundle and activating it. We can and should use staging network for development, but still we are talking about minutes here. An alternative would be to use an `Akamai sandbox`, but there are some limitations related to `sandbox` and `EdgeWorkers` like inability to fire HTTP requests from within the `EdgeWorker`.

The biggest issue I have faced while working with `Akamai EdgeWorker` is the caching of `Akamai EdgeWorker` response. I haven't found anything in the documentation related to this behavior. During development I have created more than 20+ versions of an `Akamai EdgeWorker` and I was testing everything using the `staging` network. After awhile I would get a cached JSON response and it didn't matter if I activated a new version or not. After some head scratching, I decided to purge the cache for `Akamai EdgeWorker` and after that everything got back to normal and I was able to see my code changes again. I was lucky enough that I had access to purge cache functionality, in other setups developers might be restricted from purging the cache.

After all this, should anyone try to use `Akamai EdgeWorker`, my answer would be YES, as long as you can workaround the limitations imposed by `Akamai EdgeWorker`. The ability to run logic as closely as possible to your users can not be underestimated. `Akamai` has the biggest network of points of presence, so using `Akamai` you can deliver outstanding performance. While `Akamai EdgeWorkers` event handlers might be confusing at first, they provide a lot of flexibility and you more control around how a particular request should be processed. 

# Resources
- Source code - https://github.com/artur-ciocanu/odd-akamai-edge-workers
- Adobe Target - https://business.adobe.com/products/target/adobe-target.html
- Adobe Experience Platform - https://business.adobe.com/products/experience-platform/adobe-experience-platform.html
- Adobe Target NodeJS SDK - https://adobetarget-sdks.gitbook.io/docs/sdk-reference-guides/nodejs-sdk
- Terraform - https://www.terraform.io/
- Akamai Terraform provider - https://registry.terraform.io/providers/akamai/akamai/latest/docs
- Akamai EdgeWorkers - https://developer.akamai.com/akamai-edgeworkers-overview#resources
- Akamai CLI - https://developer.akamai.com/getting-started/cli
- Akamai CLI EdgeWorkers package - https://developer.akamai.com/cli/packages/edgeworkers.html
