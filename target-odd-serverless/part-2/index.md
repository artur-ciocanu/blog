# Introduction
This is the second part in our series that covers Adobe Target NodeJS SDK with On-Device Decisioning capabilities and how to run it in a serverless/edge compute environment. In this second installment we will be covering AWS Lambda and specifically AWS Lambda@Edge.

Series list:
- part 1 - covers Akamai Edge Workers and Adobe Target NodeJS SDK
- **part 2 - covers AWS Lambd@Edge and Adobe Target NodeJS SDKNodeJS SDK**
- part 3 - covers Cloudflare Workers and Adobe Target 

# Step by step guide
As mentioned in one of our previous article at Adobe Target we use `Terraform` heavily. In this article we will show how you can leverage `Terraform` and `Adobe Target NodeJS SDK` to create an `AWS Lambda@Edge`.

`AWS Lambda@Edge` is a great technology if you intend to run some piece of logic in 200+ point of presence provided by `AWS Cloudfrount`, however it is not trivial to setup, especially if we want to set it up in a secure way. That's why we will be using `Terraform` to bootstrap all the infrastructure elements.

Before we begin there are a few prerequisites:
- `AWS account` - you will need a valid AWS account and credentials. `Terraform` relies on these credentials.
- `Terraform` - we will use it to create all the required AWS resources. Please check the official Hashicorp documentation on how to install `Terraform` on your particular OS. In this article we will be showing examples using Mac OS X.
- `NodeJS` - we will use NodeJS to get the Adobe Target NodeJS SDK dependency as well as using `NPM` to package the JavaScript and prepare it for `AWS Lambda`.

## Creating the origin S3 bucket resources
In order to use `AWS Lambda@Edge` we need to create a `Cloudfrount distribution`. At the same time a `Cloudfrount distribution` requires an "origin". We don't really need an "origin", because we will use our own code to build an HTTP response, however to make AWS happy we will create a dummy S3 bucket. Here is the Terraform code to create a simple S3 bucket:
```hcl
resource "aws_s3_bucket" "s3_bucket" {
  bucket = var.bucket_name
}
```

It is recommended to always keep `S3` bucket private, so to make sure `Cloudfront` can access our `S3` bucket we need to create an `Origin Access Identity`. Here is the `Terraform` code to do it:
```hcl
resource "aws_cloudfront_origin_access_identity" "origin_access_identity" {
}
```

Once we have the `S3` bucket and `Origin Access Identity` we can combine the two and create the `S3 bucket policy`. Here is the `Terraform` code to do it:
```hcl
data "aws_iam_policy_document" "s3_policy" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.s3_bucket.arn}/*"]

    principals {
      type        = "AWS"
      identifiers = [aws_cloudfront_origin_access_identity.origin_access_identity.iam_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "s3_bucket_policy" {
  bucket = aws_s3_bucket.s3_bucket.id
  policy = data.aws_iam_policy_document.s3_policy.json
}
```
NOTE: Here we have used Terraform `data` to create a policy document. We could have also used a JSON document and embedded into bucket policy, without a `data` element.

## Creating the AWS Lambda function
Once we have everything in place from "origin" perspective, the next step is to create the `AWS Lambda function` that will be referenced by `Cloudfrount distribution`. Here is the `Terraform` code to do it:
```hcl
resource "aws_lambda_function" "main" {
  function_name    = var.function_name
  description      = var.function_description
  filename         = var.filename
  source_code_hash = filebase64sha256(var.filename)
  handler          = var.handler
  runtime          = var.runtime
  role             = aws_iam_role.execution_role.arn
  timeout          = var.timeout
  memory_size      = var.memory_size
  publish          = true
}
```
NOTE: This is a bare bones function, for production use cases you'll want to make sure that function errors and logs are forwarded to `AWS CloudWatch`.

Looking at the `Terraform` code for `AWS Lambda function` we can se that there is a `filename`, `handler` and `runtime` fields. Let's see why we need these fields:
- `filename` - this is the path to the ZIP archive containing the `AWS Lambda function` source code
- `handler` - this is a reference a NodeJS exported function. Usually it is something like `index.handler`, assuming that the main file from the ZIP archive is `index.js` and it exports a function named `handler`.
- `runtime` - this is the NodeJS runtime, we recommend using the latest NodeJS LTS version which is `nodejs12.x`.

Having all the `Terraform` code related to `AWS Lambda function` out of the way, let's see how we can use `Adobe Target NodeJS SDK` to power the lambda function. There are a couple of prerequisites, as we already mentioned, we will be using On-Device Decisioning functionality, hence here is the list of prerequisites:
- Target account - obviously to use Target you'll need a valid Target account
- Target account has to have On-Device Decisioning enabled - this can be done from Target UI by going to Administration -> Implementation. Please check the screenshot.
![](https://gblobscdn.gitbook.com/assets%2F-M4vqj-WnIlyhHMmo1aa%2F-MI_ugoHmt5kHETnsw8H%2F-MI_wDIFKSfOlWKO0wZQ%2Fodd4.png?alt=media&token=fa2923dd-9ae6-45f6-b482-18e9f4c43b7e)
- On-Device Decisioning Artifact - the sample JavaScript code embeds the On-Device Decisioning artifact which is a JSON file containing experimentation and personalization details. The artifact can be downloaded from an URL that looks like this: `https://assets.adobetarget.com/{client code}/production/v1/rules.json`, where `{client code}` should be replaced with your Target client code.

In order to use Adobe Target NodeJS SDK we need to download it from `NPM`, we can use the following command:
```bash
$ npm i @adobe/target-nodejs-sdk -P
```
Once we have the `Adobe Target NodeJS SDK` dependency, we need to create the `AWS Lambda function handler`. Here is a sample one:
```JavaScript
const TargetClient = require("@adobe/target-nodejs-sdk");
const RULES = require("./rules.json");

const createTargetClient = () => {
  return new Promise(resolve => {
    const result = TargetClient.create({
      client: "<client code>",
      organizationId: "<IMS organization ID>",
      logger: console,
      decisioningMethod: "on-device",
      artifactPayload: RULES,
      events: {
        clientReady: () => resolve(result)
      }
    });
  });
};

const getRequestBody = event => {
  const request = event.Records[0].cf.request;
  const body = Buffer.from(request.body.data, "base64").toString();

  return JSON.parse(body);
};

const buildResponse = body => {
  return {
    status: "200",
    statusDescription: "OK",
    headers: {
      "content-type": [{
        key: "Content-Type",
        value: "application/json"
      }]
    },
    body: JSON.stringify(body)
  }
};

const buildSuccessResponse = response => {
  return buildResponse(response);
};

const buildErrorResponse = error => {
  const response = {
    message: "Something went wrong.",
    error
  };

  return buildResponse(response);
};

const targetClientPromise = createTargetClient();

exports.handler = (event, context, callback) => {
  // extremely important otherwise execution hangs
  context.callbackWaitsForEmptyEventLoop = false; 

  const request = getRequestBody(event);
  
  targetClientPromise
  .then(client => client.getOffers({request}))
  .then(deliveryResponse => {
    console.log("Response", deliveryResponse);
    
    callback(null, buildSuccessResponse(deliveryResponse.response));
  })
  .catch(error => {
    console.log("Error", error);
    
    callback(null, buildErrorResponse(error));
  });
};
```
NOTE: The `RULES` constant references the On-Device Decisioning artifact `rules.json` file. As we already mentioned, this file can be downloaded from `https://assets.adobetarget.com/{client code}/production/v1/rules.json`.

There is one thing worth mentioning, in the context of AWS Lambda function, `Adobe Target NodeJS SDK` has been created and tested in a server side context and it has a few "background processes" like polling for On-Device Decisioning updates, etc, so in order to make sure that `AWS Lambda function` does not hang and timeouts, we have to use:
```JavaScript
context.callbackWaitsForEmptyEventLoop = false; 
```
For more details around `context.callbackWaitsForEmptyEventLoop` please check the official Amazon documentation, that can be found [here](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-context.html).

We have the sample `AWS Lambda function handler` and we have the On-Device Decisioning artifact aka `rules.json`. To be able to use this code we need to package it in a ZIP archive. On a NIX system this can be done using:
```bash
$ zip -r function.zip .
```

## Creating the Cloudfrount distribution
To connect all the dots, we need to create the Cloudfront distribution. Here is the `Terraform` code to do it:
```hcl
resource "aws_cloudfront_distribution" "cloudfront_distribution" {
  enabled         = true
  is_ipv6_enabled = true

  origin {
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.origin_access_identity.cloudfront_access_identity_path
    }
    
    domain_name = aws_s3_bucket.s3_bucket.bucket_domain_name
    origin_id   = var.bucket_name
  }
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  default_cache_behavior {
    target_origin_id = var.bucket_name
    allowed_methods = ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"]
    cached_methods  = ["GET", "HEAD"]
    
    lambda_function_association {
      event_type   = "viewer-request"
      lambda_arn   = aws_lambda_function.main.qualified_arn
      include_body = true
    }
    
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 7200
    max_ttl                = 86400
  }
  
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
```
There is a lot of boilerplate, but the most interesting pieces are:
- `origin` - here we connect `S3` bucket and `Origin Access Identity`
- `default_cache_behavior` - here we have to make sure `allowed_methods` is set to `["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"]` otherwise we won't b able to process `POST` requests
- `lambda_function_association` - here we reference `AWS Lambda function` and ensure that we respond to `viewer-request` event type, which means that `AWS Lambda` will generate the response without "origin" being involved.

## Testing it out
If everything was setup properly, then you should have a `Cloudfront distribution` domain name. Using the domain name you could run a simple `cURL` command to check that everything is looking good. Here is a sample:
```bash
curl --location --request POST 'dpqwfa2gsmjjr.cloudfront.net/v1/personalization' \
--header 'Content-Type: application/json' \
--data-raw '{      
  "execute": {
    "pageLoad": {}
  }
}
'
```
This will simulate a "pageLoad" request aka "Target global mbox" call.
The output would look something like this:
```JSON
{
    "status": 200,
    "requestId": "63575665f53944a1af93337ebcd68a47",
    "id": {
        "tntId": "459b761e8c90453885ec68a845b3d0da.37_0"
    },
    "client": "targettesting",
    "execute": {
        "pageLoad": {
            "options": [
                {
                    "type": "html",
                    "content": "<div>Srsly, who dis?</div>"
                },
                {
                    "type": "html",
                    "content": "<div>mouse</div>"
                }
            ]
        }
    }
}
```

# Closing thoughts
By looking at the sheer amount of `Terraform` code one might ask:
- Why even bother?
- Why should I spend so much time and energy trying to deploy `Adobe Target NodeJS SDK` on `AWS Lambda@Edge`?

Here are a few benefits:
- `Isolation` - from security point of view, sometimes it is quite complicated to add yet another third party dependency like `Adobe Target NodeJS SDK` to your codebase. While deploying a similar code to `AWS Lambda` is pretty easy and everything is well isolated.
- `Decoupling` - if your codebase depends on `Adobe Target NodeJS SDK` and there is a bug or security issue, sometimes it might be difficult to have a release, while with `AWS Lambda` being a serverless platform, this is trivial and less dangerous.
- `Flexibility` - in the provided sample, we are returning a [Target Delivery API](http://developers.adobetarget.com/api/delivery-api/#tag/Delivery-API) response, but nothing stops you from adding custom logic and transformation to have a custom JSON output. Also you could build custom REST APIs on top of `AWS Lambda@Edg` that is tailored to your domain.
- `Performance` - not everyone is Amazon or Google or Adobe and even if you have presence in multiple geographic locations you can't beat `Cloudfront` with its 200+ points of presence. By using `AWS Lambda@Edge` and `Adobe Target NodeJS SDK` you get low latency and a lot of flexibility.

# Resources
- Source code - https://github.com/artur-ciocanu/odd-lambda-edge
- Adobe Target - https://business.adobe.com/products/target/adobe-target.html
- Adobe Experience Platform - https://business.adobe.com/products/experience-platform/adobe-experience-platform.html
- Adobe Target NodeJS SDK - https://adobetarget-sdks.gitbook.io/docs/sdk-reference-guides/nodejs-sdk
- Terraform - https://www.terraform.io/
- AWS Terraform provider - https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- AWS Lambda@Edge - https://aws.amazon.com/lambda/edge/
