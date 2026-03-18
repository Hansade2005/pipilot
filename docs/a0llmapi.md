a0 LLM API — Handbook

This document is a concise handbook for using the a0 LLM API (no API key required). It explains how to call the LLM endpoint and a recommended, safe pattern for integrating and passing tools to the LLM (tool invocation pattern). Examples are provided in cURL, JavaScript/TypeScript (Node & browser-friendly fetch), and a short guide for image generation.

Quick note: The a0 LLM returns free-text completions. If you want structured responses, instruct the model to output JSON and parse it on the client side.

Table of Contents

Overview

Endpoints

Quickstart (cURL + JS/TS)

Tool invocation pattern (recommended)

Example: image generation tool flow (full code)

Image generation endpoint

Best practices

Security & deployment notes

Troubleshooting & FAQ

Overview

The a0 LLM API provides a simple interface to send conversational messages and receive responses. It accepts a messages array containing conversation history.

Key characteristics:

No API key required

Simple messages-based conversation interface

Client-controlled tool execution

JSON responses must be generated and parsed manually by the client

Endpoints
1) LLM

POST

https://api.a0.dev/ai/llm
Request Body
{
  "messages": Message[]
}
Response
{
  "completion": "string"
}
Message format
{
  role: "system" | "user" | "assistant",
  content: "string"
}
2) Image generation (example tool)

GET

https://api.a0.dev/assets/image
Query Parameters
Param	Required	Description
text	yes	prompt for image
aspect	no	image aspect ratio (1:1, 16:9, etc)
seed	no	deterministic seed

Returns binary image data.

Quickstart
cURL Example
curl -X POST https://api.a0.dev/ai/llm \
  -H "Content-Type: application/json" \
  -d '{
    "messages":[
      {"role":"system","content":"You are a helpful assistant."},
      {"role":"user","content":"Summarize the benefits of meditation in one sentence."}
    ]
  }'
Node / TypeScript Helper
// llmClient.ts
export async function callA0LLM(messages: Array<{role:string, content:string}>) {
  const res = await fetch('https://api.a0.dev/ai/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
  return res.json();
}
Usage
const messages = [
  { role: 'system', content: 'You are a friendly assistant.' },
  { role: 'user', content: 'Write a short haiku about autumn.' }
];

const result = await callA0LLM(messages);

console.log(result.completion);
Tool Invocation Pattern (Recommended)

The a0 API does not execute tools automatically.
Instead, the client must run tools and pass results back to the LLM.

Typical flow:

Client sends conversation to LLM.

LLM responds with instructions (often JSON text).

Client parses the response.

If the response indicates a tool call, execute the tool.

Append the tool result to the conversation.

Call the LLM again to continue the interaction.

Flow Diagram
Client → LLM (messages)
LLM → Client (response)
Client parses response
Client executes tool if needed
Client → LLM (messages + tool result)
LLM → Client (final response)
Example: Image Generation Tool Flow

This example demonstrates a full workflow where the LLM requests an image and the client executes the tool.

async function callA0LLM(messages) {
  const r = await fetch('https://api.a0.dev/ai/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!r.ok) throw new Error('LLM call failed ' + r.status);
  return r.json();
}
Image Tool
async function callImageTool(prompt, aspect='1:1', seed) {
  const url = new URL('https://api.a0.dev/assets/image');

  url.searchParams.set('text', prompt);

  if (aspect) url.searchParams.set('aspect', aspect);
  if (seed) url.searchParams.set('seed', String(seed));

  const res = await fetch(url.toString());

  if (!res.ok) throw new Error('Image generation failed ' + res.status);

  const blob = await res.blob();

  const arrayBuffer = await blob.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  return `data:${blob.type};base64,${base64}`;
}
Full Flow Example
async function runImageFlow() {

  const messages = [
    {
      role: 'system',
      content: 'You are an assistant that may request images using JSON like {"action":"image","prompt":"..."}'
    },
    {
      role: 'user',
      content: 'Create a concept for a minimalist logo for a coffee shop called Brew Haven.'
    }
  ];

  const llmResp = await callA0LLM(messages);

  let toolRequest = null;

  try {
    toolRequest = JSON.parse(llmResp.completion);
  } catch {}

  if (toolRequest?.action === "image") {

    const imageDataUrl = await callImageTool(
      toolRequest.prompt || "minimal coffee logo",
      toolRequest.aspect || "1:1"
    );

    messages.push({
      role: "system",
      content: `TOOL_RESULT image=${imageDataUrl}`
    });

    const final = await callA0LLM(messages);

    return {
      text: final.completion,
      image: imageDataUrl
    };
  }

  return {
    text: llmResp.completion
  };
}
Image Generation Endpoint
Endpoint
GET https://api.a0.dev/assets/image
Example
https://api.a0.dev/assets/image?text=modern+coffee+shop+logo&aspect=1:1
Handling Response

Browser:

const blob = await response.blob()
const url = URL.createObjectURL(blob)
img.src = url

Node:

const buffer = await response.arrayBuffer()
const base64 = Buffer.from(buffer).toString("base64")
Best Practices

Use a clear system prompt to define assistant behavior.

When requesting structured data, instruct the model to respond with JSON.

Always validate and parse model output before executing tools.

Keep tool execution on your backend or trusted client environment.

Sanitize tool arguments before using them.

Security & Deployment Notes

Even though the API requires no API key, you should avoid exposing tool execution directly to users.

Recommended architecture:

User → Your Backend → a0 API
                ↓
           Tool Execution

Benefits:

request validation

rate limiting

caching expensive operations

logging and auditing

Always treat model output as untrusted input.

Never allow the model to:

run shell commands

execute arbitrary code

access unrestricted URLs

interact with sensitive systems

Troubleshooting & FAQ
Model returns invalid JSON

LLMs sometimes generate imperfect JSON.

Solutions:

attempt JSON extraction

retry the prompt

instruct the model to output valid JSON only

Model requests a tool that does not exist

Validate tool names before execution.

If unsupported:

"I cannot run that tool. Please provide another solution."

Then re-call the LLM.

Streaming responses

The current endpoint is request/response only.

If streaming is required, implement client-side chunking or staged prompts.

Summary

Quick checklist:

Use POST /ai/llm with messages.

The response contains completion text only.

If the model suggests a tool, parse the response manually.

Execute the tool in your system.

Send the result back as a new message.

Continue the conversation.

If you want, I can also generate a cleaner v2 version of this doc that is shorter (≈40% less length) and more like official OpenAI-style API docs, which makes it much easier for developers to read.

what about the repsone complete format whwo does its response look like 

The current a0 LLM endpoint response is very simple now that schema outputs were removed. The response only contains the model completion text.

Below is the actual response format you should expect from POST https://api.a0.dev/ai/llm.

a0 LLM Response Format
Request
{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Explain quantum computing in one sentence." }
  ]
}
Response
{
  "completion": "Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously, allowing certain complex problems to be solved much faster than with classical computers."
}
Field Explanation
Field	Type	Description
completion	string	The full text response generated by the model

That is the entire response payload.

Example with JSON Output (If You Prompt the Model)

If you instruct the model to output JSON, it will still appear inside completion as text, and you must parse it yourself.

Prompt
Return a JSON object with fields "title" and "summary".
Explain black holes.
Response
{
  "completion": "{ \"title\": \"Black Holes\", \"summary\": \"Regions of spacetime where gravity is so strong that nothing, not even light, can escape.\" }"
}

Then in code:

const resp = await callA0LLM(messages)

let data
try {
  data = JSON.parse(resp.completion)
} catch {
  console.error("Invalid JSON from model")
}
Full Example Response Object

Typical real response:

{
  "completion": "Here is a concept for the Brew Haven logo: A minimalist coffee cup forming a circular haven shape..."
}
Key Differences From the Old API

Removed fields:

schema_data ❌
is_structured ❌
schema ❌

Now only:

completion ✔
Recommended Pattern for Tool Use

Ask the model to respond like this:

Return JSON if a tool is needed.

Format:
{
  "action": "image | answer",
  "prompt": "..."
}

Example response:

{
  "completion": "{ \"action\": \"image\", \"prompt\": \"minimal coffee shop logo\" }"
}

Client then parses and executes the tool.




