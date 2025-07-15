import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { NewAgentNetwork, Agent } from '@mastra/core/agent';
import { anthropic } from '@ai-sdk/anthropic';
import { Memory } from '@mastra/memory';
import { weatherTool } from './tools/7c1d5b02-a84e-4a2c-a603-71ea57a3d35a.mjs';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { createTool } from '@mastra/core/tools';
import path__default from 'path';
import fs from 'fs/promises';
import { slidePreviewTool } from './tools/950a7c10-a632-40c1-81ca-96413e7652b6.mjs';
import { jobStatusTool } from './tools/b0d9adbf-1685-4da8-a5b5-c772a7b99734.mjs';
import { jobResultTool } from './tools/d66355fc-d2a0-46c9-8e57-17de7be2b41e.mjs';
import { braveMCPSearchTool } from './tools/f55f74d0-259b-40f7-8cff-7623a7a76009.mjs';
import { createAgent } from '@mastra/core';
import { anthropic as anthropic$1 } from '@mastra/anthropic';
import { openai as openai$1 } from '@mastra/openai';
import 'fs';
import '@mastra/mcp';

const forecastSchema = z.object({
  date: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  condition: z.string(),
  location: z.string()
});
function getWeatherCondition(code) {
  const conditions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    95: "Thunderstorm"
  };
  return conditions[code] || "Unknown";
}
const fetchWeather = createStep({
  id: "fetch-weather",
  description: "Fetches weather forecast for a given city",
  inputSchema: z.object({
    city: z.string().describe("The city to get the weather for")
  }),
  outputSchema: forecastSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }
    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputData.city)}&count=1`;
    const geocodingResponse = await fetch(geocodingUrl);
    const geocodingData = await geocodingResponse.json();
    if (!geocodingData.results?.[0]) {
      throw new Error(`Location '${inputData.city}' not found`);
    }
    const { latitude, longitude, name } = geocodingData.results[0];
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`;
    const response = await fetch(weatherUrl);
    const data = await response.json();
    const forecast = {
      date: (/* @__PURE__ */ new Date()).toISOString(),
      maxTemp: Math.max(...data.hourly.temperature_2m),
      minTemp: Math.min(...data.hourly.temperature_2m),
      condition: getWeatherCondition(data.current.weathercode),
      precipitationChance: data.hourly.precipitation_probability.reduce(
        (acc, curr) => Math.max(acc, curr),
        0
      ),
      location: name
    };
    return forecast;
  }
});
const planActivities = createStep({
  id: "plan-activities",
  description: "Suggests activities based on weather conditions",
  inputSchema: forecastSchema,
  outputSchema: z.object({
    activities: z.string()
  }),
  execute: async ({ inputData, mastra }) => {
    const forecast = inputData;
    if (!forecast) {
      throw new Error("Forecast data not found");
    }
    const agent = mastra?.getAgent("weatherAgent");
    if (!agent) {
      throw new Error("Weather agent not found");
    }
    const prompt = `Based on the following weather forecast for ${forecast.location}, suggest appropriate activities:
      ${JSON.stringify(forecast, null, 2)}
      For each day in the forecast, structure your response exactly as follows:

      \u{1F4C5} [Day, Month Date, Year]
      \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

      \u{1F321}\uFE0F WEATHER SUMMARY
      \u2022 Conditions: [brief description]
      \u2022 Temperature: [X\xB0C/Y\xB0F to A\xB0C/B\xB0F]
      \u2022 Precipitation: [X% chance]

      \u{1F305} MORNING ACTIVITIES
      Outdoor:
      \u2022 [Activity Name] - [Brief description including specific location/route]
        Best timing: [specific time range]
        Note: [relevant weather consideration]

      \u{1F31E} AFTERNOON ACTIVITIES
      Outdoor:
      \u2022 [Activity Name] - [Brief description including specific location/route]
        Best timing: [specific time range]
        Note: [relevant weather consideration]

      \u{1F3E0} INDOOR ALTERNATIVES
      \u2022 [Activity Name] - [Brief description including specific venue]
        Ideal for: [weather condition that would trigger this alternative]

      \u26A0\uFE0F SPECIAL CONSIDERATIONS
      \u2022 [Any relevant weather warnings, UV index, wind conditions, etc.]

      Guidelines:
      - Suggest 2-3 time-specific outdoor activities per day
      - Include 1-2 indoor backup options
      - For precipitation >50%, lead with indoor activities
      - All activities must be specific to the location
      - Include specific venues, trails, or locations
      - Consider activity intensity based on temperature
      - Keep descriptions concise but informative

      Maintain this exact formatting for consistency, using the emoji and section headers as shown.`;
    const response = await agent.stream([
      {
        role: "user",
        content: prompt
      }
    ]);
    let activitiesText = "";
    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      activitiesText += chunk;
    }
    return {
      activities: activitiesText
    };
  }
});
const weatherWorkflow = createWorkflow({
  id: "weather-workflow",
  inputSchema: z.object({
    city: z.string().describe("The city to get the weather for")
  }),
  outputSchema: z.object({
    activities: z.string()
  })
}).then(fetchWeather).then(planActivities);
weatherWorkflow.commit();

const geminiSearchStep = createStep({
  id: "gemini-search",
  description: "Gemini Flash\u306EGoogle Search grounding\u3092\u4F7F\u7528\u3057\u3066Web\u691C\u7D22\u3092\u5B9F\u884C\u3057\u307E\u3059",
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number().optional().default(10),
    language: z.string().optional().default("ja"),
    userLocation: z.object({
      country: z.string().optional().default("JP"),
      city: z.string().optional().default("Tokyo"),
      region: z.string().optional().default("Tokyo")
    }).optional()
  }),
  outputSchema: z.object({
    searchResults: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      age: z.string().optional()
    })),
    rawResults: z.string(),
    searchTime: z.number(),
    success: z.boolean()
  }),
  execute: async ({ inputData, mastra, runtimeContext }) => {
    const { query, maxResults } = inputData;
    const startTime = Date.now();
    try {
      console.log(`\u{1F50D} Gemini Flash\u3092\u4F7F\u7528\u3057\u3066Web\u691C\u7D22\u3092\u5B9F\u884C: "${query}"`);
      const agent = mastra?.getAgent("workflowSearchAgent");
      if (!agent) {
        throw new Error("workflowSearchAgent\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      }
      const resourceId = runtimeContext?.get("resourceId");
      const threadId = runtimeContext?.get("threadId");
      const searchPrompt = `
\u4EE5\u4E0B\u306B\u3064\u3044\u3066\u6700\u65B0\u306E\u60C5\u5831\u3092\u691C\u7D22\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

${query}

\u691C\u7D22\u7D50\u679C\u304B\u3089${maxResults}\u4EF6\u7A0B\u5EA6\u306E\u95A2\u9023\u6027\u306E\u9AD8\u3044\u60C5\u5831\u3092\u9078\u3073\u3001\u305D\u308C\u305E\u308C\u306B\u3064\u3044\u3066\u4EE5\u4E0B\u306E\u5F62\u5F0F\u3067\u6574\u7406\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

1. \u30BF\u30A4\u30C8\u30EB: [\u8A18\u4E8B\u3084\u30DA\u30FC\u30B8\u306E\u30BF\u30A4\u30C8\u30EB]
   URL: [\u60C5\u5831\u6E90\u306EURL]
   \u6982\u8981: [\u5185\u5BB9\u306E\u8981\u7D04]
   
2. \u30BF\u30A4\u30C8\u30EB: ...
   \uFF08\u4EE5\u4E0B\u540C\u69D8\uFF09

\u91CD\u8981\uFF1A\u4FE1\u983C\u6027\u306E\u9AD8\u3044\u60C5\u5831\u6E90\u3092\u512A\u5148\u3057\u3001\u6700\u65B0\u306E\u60C5\u5831\u3092\u542B\u3081\u3066\u304F\u3060\u3055\u3044\u3002
`;
      console.log("\u{1F4E1} \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u306E\u30B9\u30C8\u30EA\u30FC\u30E0\u3092\u958B\u59CB...");
      const response = await agent.stream([
        {
          role: "user",
          content: searchPrompt
        }
      ], {
        memory: resourceId && threadId ? {
          resource: resourceId,
          thread: threadId
        } : void 0
      });
      let searchResults = [];
      let rawResults = "";
      let textResponse = "";
      let success = false;
      const toolExecuted = false;
      console.log("\u{1F504} \u30B9\u30C8\u30EA\u30FC\u30E0\u3092\u51E6\u7406\u4E2D...");
      for await (const chunk of response.fullStream) {
        if (chunk.type === "text-delta") {
          textResponse += chunk.textDelta;
        }
      }
      if (textResponse && textResponse.includes("http")) {
        console.log("\u2705 Google Search grounding\u306B\u3088\u308B\u691C\u7D22\u304C\u5B9F\u884C\u3055\u308C\u307E\u3057\u305F");
        success = true;
      }
      console.log(`\u{1F4DD} \u30B9\u30C8\u30EA\u30FC\u30E0\u51E6\u7406\u5B8C\u4E86 - \u30C4\u30FC\u30EB\u5B9F\u884C: ${toolExecuted}, \u6210\u529F: ${success}`);
      console.log(`\u{1F4DD} \u30C6\u30AD\u30B9\u30C8\u5FDC\u7B54\u306E\u9577\u3055: ${textResponse.length}`);
      if (success && textResponse) {
        console.log("\u{1F4DD} Gemini Flash\u306E\u5FDC\u7B54\u304B\u3089\u691C\u7D22\u7D50\u679C\u3092\u62BD\u51FA\u4E2D...");
        const agentResponse = textResponse;
        const lines = agentResponse.split("\n");
        let currentResult = {};
        for (const line of lines) {
          const numberMatch = line.match(/^(\d+)\.\s*(タイトル:|Title:)/);
          if (numberMatch) {
            if (currentResult.title && currentResult.url) {
              searchResults.push({
                title: currentResult.title,
                url: currentResult.url,
                snippet: currentResult.snippet || "",
                age: currentResult.age || ""
              });
            }
            currentResult = {
              title: line.replace(/^\d+\.\s*(タイトル:|Title:)\s*/, "").trim()
            };
          } else if (line.includes("\u30BF\u30A4\u30C8\u30EB:") || line.includes("Title:")) {
            if (currentResult.title && currentResult.url) {
              searchResults.push({
                title: currentResult.title,
                url: currentResult.url,
                snippet: currentResult.snippet || "",
                age: currentResult.age || ""
              });
            }
            currentResult = { title: line.replace(/^(タイトル:|Title:)\s*/, "").trim() };
          } else if (line.match(/^\s*(URL:|url:)/)) {
            currentResult.url = line.replace(/^\s*(URL:|url:)\s*/, "").trim();
          } else if (line.match(/^\s*(概要:|Description:|Snippet:)/)) {
            currentResult.snippet = line.replace(/^\s*(概要:|Description:|Snippet:)\s*/, "").trim();
          }
        }
        if (currentResult.title && currentResult.url) {
          searchResults.push({
            title: currentResult.title,
            url: currentResult.url,
            snippet: currentResult.snippet || "",
            age: currentResult.age || ""
          });
        }
        console.log(`\u{1F4CA} ${searchResults.length}\u4EF6\u306E\u691C\u7D22\u7D50\u679C\u3092\u62BD\u51FA\u3057\u307E\u3057\u305F`);
        rawResults = textResponse;
      }
      const searchTime = Date.now() - startTime;
      console.log(`\u2705 Gemini Flash\u691C\u7D22\u5B8C\u4E86 (${searchTime}ms)`);
      console.log(`\u{1F4CA} \u691C\u7D22\u7D50\u679C: ${searchResults.length}\u4EF6`);
      if (!success || searchResults.length === 0) {
        console.warn("\u26A0\uFE0F \u691C\u7D22\u7D50\u679C\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
        console.warn(`\u26A0\uFE0F \u30C4\u30FC\u30EB\u5B9F\u884C: ${toolExecuted}, \u6210\u529F: ${success}, \u7D50\u679C\u6570: ${searchResults.length}`);
        if (textResponse && textResponse.includes(query)) {
          console.log("\u{1F4DD} \u30C6\u30AD\u30B9\u30C8\u5FDC\u7B54\u304B\u3089\u60C5\u5831\u3092\u62BD\u51FA\u3057\u307E\u3059");
          searchResults = [{
            title: `${query}\u306B\u95A2\u3059\u308B\u691C\u7D22\u7D50\u679C`,
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            snippet: textResponse.substring(0, 200) + "...",
            age: ""
          }];
        } else {
          console.warn("\u26A0\uFE0F \u691C\u7D22\u7D50\u679C\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
        }
        return {
          searchResults,
          rawResults: JSON.stringify({ web: { results: searchResults } }),
          searchTime: Date.now() - startTime,
          success: true
        };
      }
      return {
        searchResults,
        rawResults,
        searchTime,
        success: true
      };
    } catch (error) {
      console.error("\u274C Gemini Flash\u691C\u7D22\u30A8\u30E9\u30FC:", error);
      console.error("\u30A8\u30E9\u30FC\u306E\u8A73\u7D30:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : void 0
      });
      const searchTime = Date.now() - startTime;
      return {
        searchResults: [],
        rawResults: "",
        searchTime,
        success: false
      };
    }
  }
});
const validateSearchResultsStep = createStep({
  id: "validate-search-results",
  description: "workflowAgent\u304C\u691C\u7D22\u7D50\u679C\u306E\u59A5\u5F53\u6027\u3092\u5224\u65AD\u3057\u307E\u3059",
  inputSchema: z.object({
    searchResults: z.array(z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
      age: z.string().optional()
    })),
    rawResults: z.string(),
    searchTime: z.number(),
    success: z.boolean()
  }),
  outputSchema: z.object({
    isValid: z.boolean(),
    validationScore: z.number(),
    feedback: z.string(),
    shouldRetry: z.boolean(),
    refinedQuery: z.string().optional()
  }),
  execute: async ({ inputData, getInitData, runtimeContext, mastra }) => {
    const { searchResults, success } = inputData;
    const { query } = getInitData();
    try {
      console.log(`\u{1F9D0} \u691C\u7D22\u7D50\u679C\u306E\u59A5\u5F53\u6027\u3092\u5224\u65AD\u4E2D...`);
      const agent = mastra?.getAgent("workflowSearchAgent");
      if (!agent) {
        throw new Error("workflowSearchAgent\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      }
      const resourceId = runtimeContext?.get("resourceId");
      const threadId = runtimeContext?.get("threadId");
      const validationPrompt = `\u4EE5\u4E0B\u306E\u691C\u7D22\u7D50\u679C\u3092\u8A55\u4FA1\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

**\u691C\u7D22\u30AF\u30A8\u30EA**: "${query}"
**\u691C\u7D22\u7D50\u679C\u6570**: ${searchResults.length}\u4EF6
**\u691C\u7D22\u6210\u529F**: ${success ? "\u306F\u3044" : "\u3044\u3044\u3048"}

**\u691C\u7D22\u7D50\u679C**:
${searchResults.map((result, index) => `
${index + 1}. ${result.title}
   URL: ${result.url}
   \u6982\u8981: ${result.snippet}
   ${result.age ? `\u66F4\u65B0: ${result.age}` : ""}
`).join("\n")}

\u4EE5\u4E0B\u306E\u89B3\u70B9\u304B\u3089\u8A55\u4FA1\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

1. **\u95A2\u9023\u6027**: \u691C\u7D22\u7D50\u679C\u306F\u30AF\u30A8\u30EA\u306B\u95A2\u9023\u3057\u3066\u3044\u307E\u3059\u304B\uFF1F
2. **\u4FE1\u983C\u6027**: \u60C5\u5831\u6E90\u306F\u4FE1\u983C\u3067\u304D\u307E\u3059\u304B\uFF1F
3. **\u5B8C\u5168\u6027**: \u5FC5\u8981\u306A\u60C5\u5831\u304C\u5341\u5206\u306B\u542B\u307E\u308C\u3066\u3044\u307E\u3059\u304B\uFF1F
4. **\u6700\u65B0\u6027**: \u60C5\u5831\u306F\u6700\u65B0\u3067\u3059\u304B\uFF1F

\u8A55\u4FA1\u7D50\u679C\u3092\u4EE5\u4E0B\u306EJSON\u5F62\u5F0F\u3067\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
{
  "validationScore": 0-100\u306E\u6570\u5024,
  "isValid": true/false\uFF0860\u70B9\u4EE5\u4E0A\u3067true\uFF09,
  "feedback": "\u8A55\u4FA1\u306E\u8A73\u7D30\u8AAC\u660E",
  "shouldRetry": true/false\uFF08\u518D\u691C\u7D22\u304C\u5FC5\u8981\u304B\uFF09,
  "refinedQuery": "\u3088\u308A\u826F\u3044\u691C\u7D22\u30AF\u30A8\u30EA\uFF08\u518D\u691C\u7D22\u304C\u5FC5\u8981\u306A\u5834\u5408\u306E\u307F\uFF09"
}`;
      const { text } = await agent.generate(
        validationPrompt,
        {
          memory: resourceId && threadId ? {
            resource: resourceId,
            thread: threadId
          } : void 0
        }
      );
      let evaluation;
      try {
        evaluation = JSON.parse(text);
      } catch {
        evaluation = {
          validationScore: searchResults.length > 0 ? 60 : 30,
          isValid: searchResults.length > 3,
          feedback: text,
          shouldRetry: searchResults.length < 3,
          refinedQuery: void 0
        };
      }
      console.log(`\u2705 \u59A5\u5F53\u6027\u5224\u65AD\u5B8C\u4E86 (\u30B9\u30B3\u30A2: ${evaluation.validationScore}/100)`);
      return {
        isValid: evaluation.isValid || false,
        validationScore: evaluation.validationScore || 50,
        feedback: evaluation.feedback || "\u8A55\u4FA1\u7D50\u679C\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F",
        shouldRetry: evaluation.shouldRetry || false,
        refinedQuery: evaluation.refinedQuery
      };
    } catch (error) {
      console.error("\u59A5\u5F53\u6027\u5224\u65AD\u30A8\u30E9\u30FC:", error);
      return {
        isValid: searchResults.length > 0,
        validationScore: searchResults.length > 0 ? 50 : 0,
        feedback: `\u59A5\u5F53\u6027\u5224\u65AD\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error instanceof Error ? error.message : "Unknown error"}`,
        shouldRetry: searchResults.length === 0,
        refinedQuery: void 0
      };
    }
  }
});
const analyzeSearchResultsStep = createStep({
  id: "analyze-search-results",
  description: "workflowAgent\u304C\u691C\u7D22\u7D50\u679C\u3092\u7D71\u5408\u3057\u3001\u8CEA\u554F\u306B\u5BFE\u3059\u308B\u5305\u62EC\u7684\u306A\u56DE\u7B54\u3092\u751F\u6210\u3057\u307E\u3059",
  inputSchema: z.object({
    needsRetry: z.boolean(),
    retryQuery: z.string(),
    currentRetryCount: z.number()
  }),
  outputSchema: z.object({
    summary: z.string(),
    detailedInfo: z.array(z.string()),
    additionalInfo: z.string(),
    sources: z.array(z.object({
      title: z.string(),
      url: z.string()
    }))
  }),
  execute: async ({ getInitData, getStepResult, runtimeContext, mastra }) => {
    const { query } = getInitData();
    const { searchResults } = getStepResult(geminiSearchStep);
    try {
      console.log(`\u{1F9E0} \u691C\u7D22\u7D50\u679C\u3092\u7D71\u5408\u3057\u3066\u56DE\u7B54\u3092\u751F\u6210\u4E2D...`);
      const agent = mastra?.getAgent("workflowSearchAgent");
      if (!agent) {
        throw new Error("workflowSearchAgent\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      }
      const resourceId = runtimeContext?.get("resourceId");
      const threadId = runtimeContext?.get("threadId");
      const analysisPrompt = `\u4EE5\u4E0B\u306E\u691C\u7D22\u7D50\u679C\u3092\u7DCF\u5408\u7684\u306B\u5206\u6790\u3057\u3001\u300C${query}\u300D\u3068\u3044\u3046\u8CEA\u554F\u306B\u5BFE\u3059\u308B\u5305\u62EC\u7684\u306A\u56DE\u7B54\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002

**\u691C\u7D22\u7D50\u679C**:
${searchResults.map((result, index) => `
${index + 1}. ${result.title}
   URL: ${result.url}
   \u6982\u8981: ${result.snippet}
   ${result.age ? `\u66F4\u65B0: ${result.age}` : ""}
`).join("\n")}

\u4EE5\u4E0B\u306E\u70B9\u306B\u6CE8\u610F\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
1. \u8907\u6570\u306E\u60C5\u5831\u6E90\u304B\u3089\u5F97\u305F\u60C5\u5831\u3092\u7D71\u5408\u3057\u3066\u3001\u4E00\u8CAB\u6027\u306E\u3042\u308B\u56DE\u7B54\u3092\u4F5C\u6210
2. \u8CEA\u554F\u306B\u76F4\u63A5\u7B54\u3048\u308B\u5F62\u3067\u8A18\u8FF0
3. \u91CD\u8981\u306A\u60C5\u5831\u306F\u69CB\u9020\u5316\u3057\u3066\u6574\u7406
4. \u77DB\u76FE\u3059\u308B\u60C5\u5831\u304C\u3042\u308B\u5834\u5408\u306F\u3001\u305D\u306E\u65E8\u3092\u660E\u8A18
5. \u5C02\u9580\u7528\u8A9E\u306F\u5FC5\u8981\u306B\u5FDC\u3058\u3066\u8AAC\u660E\u3092\u52A0\u3048\u308B

JSON\u5F62\u5F0F\u3067\u4EE5\u4E0B\u306E\u69CB\u9020\u3067\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A
{
  "summary": "\u8CEA\u554F\u3078\u306E\u76F4\u63A5\u7684\u306A\u56DE\u7B54\uFF081-2\u6BB5\u843D\uFF09",
  "detailedInfo": [
    "\u91CD\u8981\u306A\u30DD\u30A4\u30F3\u30C81",
    "\u91CD\u8981\u306A\u30DD\u30A4\u30F3\u30C82",
    "\u91CD\u8981\u306A\u30DD\u30A4\u30F3\u30C83"
  ],
  "additionalInfo": "\u88DC\u8DB3\u60C5\u5831\u3084\u6CE8\u610F\u70B9"
}`;
      const { text: responseText } = await agent.generate(
        analysisPrompt,
        {
          memory: resourceId && threadId ? {
            resource: resourceId,
            thread: threadId
          } : void 0
        }
      );
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch {
        parsedResponse = {
          summary: responseText,
          detailedInfo: [],
          additionalInfo: ""
        };
      }
      const sources = searchResults.map((result) => ({
        title: result.title,
        url: result.url
      }));
      console.log(`\u2705 \u56DE\u7B54\u751F\u6210\u5B8C\u4E86`);
      return {
        summary: parsedResponse.summary || `\u300C${query}\u300D\u306B\u3064\u3044\u3066\u306E\u60C5\u5831\u3092\u307E\u3068\u3081\u307E\u3057\u305F\u3002`,
        detailedInfo: parsedResponse.detailedInfo || [`\u691C\u7D22\u7D50\u679C: ${searchResults.length}\u4EF6`],
        additionalInfo: parsedResponse.additionalInfo || "",
        sources
      };
    } catch (error) {
      console.error("\u5206\u6790\u30A8\u30E9\u30FC:", error);
      return {
        summary: `\u300C${query}\u300D\u306B\u3064\u3044\u3066\u306E\u691C\u7D22\u3092\u5B9F\u884C\u3057\u307E\u3057\u305F\u304C\u3001\u5206\u6790\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002`,
        detailedInfo: [
          `\u691C\u7D22\u7D50\u679C: ${searchResults.length}\u4EF6\u53D6\u5F97`,
          "\u30A8\u30E9\u30FC\u306B\u3088\u308A\u8A73\u7D30\u306A\u5206\u6790\u306F\u5B9F\u884C\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F"
        ],
        additionalInfo: `\u30A8\u30E9\u30FC\u8A73\u7D30: ${error instanceof Error ? error.message : "Unknown error"}`,
        sources: searchResults.map((result) => ({
          title: result.title,
          url: result.url
        }))
      };
    }
  }
});
const generateWebSearchReportStep = createStep({
  id: "generate-web-search-report",
  description: "Web\u691C\u7D22\u7D50\u679C\u3068\u5206\u6790\u3092\u7D71\u5408\u3057\u305F\u6700\u7D42\u30EC\u30DD\u30FC\u30C8\u3092\u751F\u6210\u3057\u307E\u3059",
  inputSchema: z.object({
    summary: z.string(),
    detailedInfo: z.array(z.string()),
    additionalInfo: z.string(),
    sources: z.array(z.object({
      title: z.string(),
      url: z.string()
    }))
  }),
  outputSchema: z.object({
    report: z.string(),
    metadata: z.object({
      jobId: z.string(),
      completedAt: z.string(),
      processingTime: z.number(),
      searchEngine: z.string(),
      citationCount: z.number(),
      retryCount: z.number()
    })
  }),
  execute: async ({ inputData, runId, getInitData, getStepResult, runtimeContext }) => {
    const startTime = Date.now();
    const {
      summary,
      detailedInfo,
      additionalInfo,
      sources
    } = inputData;
    const { query } = getInitData();
    const { searchTime } = getStepResult(geminiSearchStep);
    const retryCount = runtimeContext?.get("retryCount") || 0;
    const report = `
# \u300C${query}\u300D\u306B\u3064\u3044\u3066\u306E\u8ABF\u67FB\u7D50\u679C

## \u6982\u8981
${summary}

## \u8A73\u7D30\u60C5\u5831
${detailedInfo.map((info) => `- ${info}`).join("\n")}

${additionalInfo ? `## \u8FFD\u52A0\u60C5\u5831
${additionalInfo}` : ""}

## \u53C2\u8003\u8CC7\u6599
${sources.length > 0 ? sources.map((source, index) => `${index + 1}. [${source.title}](${source.url})`).join("\n") : "\u53C2\u8003\u8CC7\u6599\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002"}

---
\u691C\u7D22\u65E5\u6642: ${(/* @__PURE__ */ new Date()).toLocaleString("ja-JP")} | \u60C5\u5831\u6E90: ${sources.length}\u4EF6
    `.trim();
    const processingTime = Date.now() - startTime;
    console.log(`\u{1F4DD} Web\u691C\u7D22\u30EC\u30DD\u30FC\u30C8\u751F\u6210\u5B8C\u4E86 (${processingTime}ms)`);
    return {
      report,
      metadata: {
        jobId: runId || `search-job-${Date.now()}`,
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        processingTime: searchTime + processingTime,
        searchEngine: "Google Search (Gemini Flash)",
        citationCount: sources.length,
        retryCount
      }
    };
  }
});
const checkRetryStep = createStep({
  id: "check-retry",
  description: "\u691C\u7D22\u7D50\u679C\u304C\u4E0D\u5341\u5206\u304B\u3069\u3046\u304B\u3092\u5224\u65AD\u3057\u3001\u518D\u691C\u7D22\u304C\u5FC5\u8981\u306A\u5834\u5408\u306F\u6E96\u5099\u3057\u307E\u3059",
  inputSchema: z.object({
    isValid: z.boolean(),
    validationScore: z.number(),
    feedback: z.string(),
    shouldRetry: z.boolean(),
    refinedQuery: z.string().optional()
  }),
  outputSchema: z.object({
    needsRetry: z.boolean(),
    retryQuery: z.string(),
    currentRetryCount: z.number()
  }),
  execute: async ({ inputData, getInitData, runtimeContext }) => {
    const { shouldRetry, refinedQuery, validationScore } = inputData;
    const initData = getInitData();
    const currentRetryCount = runtimeContext?.get("retryCount") || 0;
    const needsRetry = shouldRetry && validationScore < 60 && currentRetryCount < 3;
    if (needsRetry) {
      console.log(`\u{1F504} \u518D\u691C\u7D22\u304C\u5FC5\u8981\u3067\u3059 (\u8A66\u884C\u56DE\u6570: ${currentRetryCount + 1}/3)`);
      runtimeContext?.set("retryCount", currentRetryCount + 1);
    }
    return {
      needsRetry,
      retryQuery: refinedQuery || initData.query,
      currentRetryCount: needsRetry ? currentRetryCount + 1 : currentRetryCount
    };
  }
});
const webSearchWorkflow = createWorkflow({
  id: "web-search-workflow",
  description: "Gemini Flash\u306EGoogle Search grounding\u3092\u4F7F\u7528\u3057\u3066Web\u691C\u7D22\u3068\u5206\u6790\u3092\u884C\u3044\u307E\u3059",
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number().optional().default(10),
    language: z.string().optional().default("ja"),
    userLocation: z.object({
      country: z.string().optional().default("JP"),
      city: z.string().optional().default("Tokyo"),
      region: z.string().optional().default("Tokyo")
    }).optional()
  }),
  outputSchema: z.object({
    report: z.string(),
    metadata: z.object({
      jobId: z.string(),
      completedAt: z.string(),
      processingTime: z.number(),
      searchEngine: z.string(),
      citationCount: z.number(),
      retryCount: z.number()
    })
  })
}).then(geminiSearchStep).then(validateSearchResultsStep).then(checkRetryStep).then(analyzeSearchResultsStep).then(generateWebSearchReportStep).commit();

const generateSlideStep = createStep({
  id: "generate-slide",
  description: "GPT-4o\u3092\u4F7F\u7528\u3057\u3066\u30B9\u30E9\u30A4\u30C9\u7528\u306EHTML\u30B3\u30FC\u30C9\u3092\u751F\u6210\u3057\u307E\u3059",
  inputSchema: z.object({
    topic: z.string().describe("\u30B9\u30E9\u30A4\u30C9\u306E\u30C8\u30D4\u30C3\u30AF"),
    slideCount: z.number().optional().default(5).describe("\u30B9\u30E9\u30A4\u30C9\u306E\u679A\u6570"),
    style: z.string().optional().default("modern").describe("\u30B9\u30E9\u30A4\u30C9\u306E\u30B9\u30BF\u30A4\u30EB"),
    language: z.string().optional().default("ja").describe("\u30B9\u30E9\u30A4\u30C9\u306E\u8A00\u8A9E")
  }),
  outputSchema: z.object({
    htmlCode: z.string(),
    generationTime: z.number(),
    slideCount: z.number(),
    style: z.string()
  }),
  execute: async ({ inputData, runtimeContext, mastra }) => {
    const { topic, slideCount, style, language } = inputData;
    const startTime = Date.now();
    try {
      console.log(`\u{1F3A8} \u30B9\u30E9\u30A4\u30C9\u751F\u6210\u958B\u59CB: "${topic}" (${slideCount}\u679A)`);
      const resourceId = runtimeContext?.get("resourceId");
      const threadId = runtimeContext?.get("threadId");
      console.log(`\u{1F4DD} \u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u60C5\u5831: resourceId=${resourceId}, threadId=${threadId}`);
      const agent = mastra?.getAgent("workflowAgent");
      if (!agent) {
        throw new Error("workflowAgent\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      }
      const slidePrompt = language === "ja" ? `\u300C${topic}\u300D\u306B\u3064\u3044\u3066${slideCount}\u679A\u306E\u30B9\u30E9\u30A4\u30C9\u3092\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u30B9\u30BF\u30A4\u30EB\u306F${style}\u3067\u3001\u65E5\u672C\u8A9E\u3067\u4F5C\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002

\u4EE5\u4E0B\u306E\u8981\u4EF6\u306B\u5F93\u3063\u3066\u3001\u5B8C\u5168\u306AHTML\u30B3\u30FC\u30C9\u306E\u307F\u3092\u51FA\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

1. **HTML\u69CB\u9020**: \u5B8C\u5168\u306B\u72EC\u7ACB\u3057\u305FHTML\u30D5\u30A1\u30A4\u30EB\u3068\u3057\u3066\u4F5C\u6210
2. **\u30B9\u30BF\u30A4\u30EA\u30F3\u30B0**: \u5185\u90E8CSS\u3092\u4F7F\u7528\u3057\u3066\u30E2\u30C0\u30F3\u3067\u7F8E\u3057\u3044\u30C7\u30B6\u30A4\u30F3
3. **\u30EC\u30B9\u30DD\u30F3\u30B7\u30D6**: \u69D8\u3005\u306A\u753B\u9762\u30B5\u30A4\u30BA\u306B\u5BFE\u5FDC
4. **\u30CA\u30D3\u30B2\u30FC\u30B7\u30E7\u30F3**: \u30AD\u30FC\u30DC\u30FC\u30C9\uFF08\u2190\u2192\uFF09\u3068\u30AF\u30EA\u30C3\u30AF\u3067\u30B9\u30E9\u30A4\u30C9\u5207\u308A\u66FF\u3048
5. **\u30A2\u30CB\u30E1\u30FC\u30B7\u30E7\u30F3**: \u6ED1\u3089\u304B\u306A\u30B9\u30E9\u30A4\u30C9\u9077\u79FB\u52B9\u679C
6. **\u30B3\u30F3\u30C6\u30F3\u30C4**: \u5404\u30B9\u30E9\u30A4\u30C9\u306B\u9069\u5207\u306A\u30BF\u30A4\u30C8\u30EB\u3001\u5185\u5BB9\u3001\u8996\u899A\u7684\u8981\u7D20

**\u91CD\u8981**: 
- \u5916\u90E8\u30E9\u30A4\u30D6\u30E9\u30EA\u306F\u4F7F\u7528\u305B\u305A\u3001\u7D14\u7C8B\u306AHTML/CSS/JavaScript\u3067\u4F5C\u6210
- CDN\u30EA\u30F3\u30AF\u3082\u4F7F\u7528\u3057\u306A\u3044
- \u5B8C\u5168\u306B\u81EA\u5DF1\u5B8C\u7D50\u3057\u305FHTML\u30B3\u30FC\u30C9\u306E\u307F\u3092\u51FA\u529B
- \u30EC\u30B9\u30DD\u30F3\u30B9\u5168\u4F53\u304CHTML\u30B3\u30FC\u30C9\u306B\u306A\u308B\u3088\u3046\u306B

**\u30B9\u30E9\u30A4\u30C9\u306E\u69CB\u6210**:
1. \u30BF\u30A4\u30C8\u30EB\u30B9\u30E9\u30A4\u30C9
2. \u6982\u8981/\u76EE\u6B21
3. \u30E1\u30A4\u30F3\u30B3\u30F3\u30C6\u30F3\u30C4\uFF08\u8907\u6570\u30B9\u30E9\u30A4\u30C9\uFF09
4. \u307E\u3068\u3081/\u7D50\u8AD6
5. \u8CEA\u7591\u5FDC\u7B54/\u7D42\u4E86\u30B9\u30E9\u30A4\u30C9

**\u30C7\u30B6\u30A4\u30F3\u30AC\u30A4\u30C9\u30E9\u30A4\u30F3**:
- ${style}\u30B9\u30BF\u30A4\u30EB\u3092\u9069\u7528
- \u8AAD\u307F\u3084\u3059\u3044\u30D5\u30A9\u30F3\u30C8
- \u9069\u5207\u306A\u30B3\u30F3\u30C8\u30E9\u30B9\u30C8
- \u8996\u899A\u7684\u306A\u968E\u5C64\u69CB\u9020
- \u30A2\u30A4\u30B3\u30F3\u3084\u56F3\u5F62\u306E\u6D3B\u7528\uFF08CSS/HTML\u306E\u307F\u3067\u4F5C\u6210\uFF09` : `Create ${slideCount} slides about "${topic}" in ${style} style. Output only complete HTML code.`;
      const { text: htmlCode } = await agent.generate(
        slidePrompt,
        {
          memory: resourceId && threadId ? {
            resource: resourceId,
            thread: threadId
          } : void 0
        }
      );
      let cleanedHtmlCode = htmlCode.replace(/^```html\s*\n?/gm, "").replace(/\n?```$/gm, "");
      cleanedHtmlCode = cleanedHtmlCode.replace(/^```\s*\n?/gm, "").replace(/\n?```$/gm, "");
      const generationTime = Date.now() - startTime;
      console.log(`\u2705 \u30B9\u30E9\u30A4\u30C9\u751F\u6210\u5B8C\u4E86 (${generationTime}ms)`);
      console.log(`\u{1F4C4} \u751F\u6210\u3055\u308C\u305FHTML\u30B5\u30A4\u30BA: ${cleanedHtmlCode.length}\u6587\u5B57`);
      return {
        htmlCode: cleanedHtmlCode,
        generationTime,
        slideCount,
        style
      };
    } catch (error) {
      console.error("\u30B9\u30E9\u30A4\u30C9\u751F\u6210\u30A8\u30E9\u30FC:", error);
      const fallbackHtml = `<!DOCTYPE html>
<html lang="${language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${topic} - \u30B9\u30E9\u30A4\u30C9</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            overflow: hidden;
        }
        .slide-container {
            width: 100vw;
            height: 100vh;
            position: relative;
        }
        .slide {
            width: 100%;
            height: 100%;
            display: none;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 2rem;
            box-sizing: border-box;
        }
        .slide.active {
            display: flex;
            flex-direction: column;
        }
        .slide h1 {
            font-size: 3rem;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .slide h2 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .slide p {
            font-size: 1.5rem;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
        }
        .navigation {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
        }
        .nav-btn {
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
        }
        .nav-btn:hover {
            background: rgba(255,255,255,0.3);
        }
        .slide-counter {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.3);
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 1rem;
        }
    </style>
</head>
<body>
    <div class="slide-container">
        <div class="slide-counter">
            <span id="current-slide">1</span> / <span id="total-slides">${slideCount}</span>
        </div>
        
        <div class="slide active">
            <h1>${topic}</h1>
            <p>\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u304C\u3001\u57FA\u672C\u7684\u306A\u30B9\u30E9\u30A4\u30C9\u3092\u8868\u793A\u3057\u3066\u3044\u307E\u3059\u3002</p>
        </div>
        
        <div class="slide">
            <h2>\u30A8\u30E9\u30FC\u8A73\u7D30</h2>
            <p>${error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
        
        <div class="slide">
            <h2>\u3054\u4E86\u627F\u304F\u3060\u3055\u3044</h2>
            <p>\u30B9\u30E9\u30A4\u30C9\u751F\u6210\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002<br>\u518D\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002</p>
        </div>
        
        <div class="navigation">
            <button class="nav-btn" onclick="previousSlide()">\u2190 \u524D\u3078</button>
            <button class="nav-btn" onclick="nextSlide()">\u6B21\u3078 \u2192</button>
        </div>
    </div>

    <script>
        let currentSlide = 0;
        const slides = document.querySelectorAll('.slide');
        const totalSlides = slides.length;
        
        document.getElementById('total-slides').textContent = totalSlides;
        
        function showSlide(n) {
            slides[currentSlide].classList.remove('active');
            currentSlide = (n + totalSlides) % totalSlides;
            slides[currentSlide].classList.add('active');
            document.getElementById('current-slide').textContent = currentSlide + 1;
        }
        
        function nextSlide() {
            showSlide(currentSlide + 1);
        }
        
        function previousSlide() {
            showSlide(currentSlide - 1);
        }
        
        // \u30AD\u30FC\u30DC\u30FC\u30C9\u30CA\u30D3\u30B2\u30FC\u30B7\u30E7\u30F3
        document.addEventListener('keydown', function(e) {
            if (e.key === 'ArrowRight') nextSlide();
            if (e.key === 'ArrowLeft') previousSlide();
        });
        
        // \u30AF\u30EA\u30C3\u30AF\u30CA\u30D3\u30B2\u30FC\u30B7\u30E7\u30F3
        document.addEventListener('click', function(e) {
            if (e.target.closest('.nav-btn')) return;
            if (e.clientX > window.innerWidth / 2) {
                nextSlide();
            } else {
                previousSlide();
            }
        });
    </script>
</body>
</html>`;
      const generationTime = Date.now() - startTime;
      return {
        htmlCode: fallbackHtml,
        generationTime,
        slideCount,
        style
      };
    }
  }
});
const slideGenerationWorkflow = createWorkflow({
  id: "slide-generation-workflow",
  description: "\u30B9\u30E9\u30A4\u30C9\u7528\u306EHTML\u30B3\u30FC\u30C9\u3092\u751F\u6210\u3059\u308B\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC",
  inputSchema: z.object({
    topic: z.string().describe("\u30B9\u30E9\u30A4\u30C9\u306E\u30C8\u30D4\u30C3\u30AF"),
    slideCount: z.number().optional().default(5).describe("\u30B9\u30E9\u30A4\u30C9\u306E\u679A\u6570"),
    style: z.string().optional().default("modern").describe("\u30B9\u30E9\u30A4\u30C9\u306E\u30B9\u30BF\u30A4\u30EB"),
    language: z.string().optional().default("ja").describe("\u30B9\u30E9\u30A4\u30C9\u306E\u8A00\u8A9E")
  }),
  outputSchema: z.object({
    htmlCode: z.string(),
    generationTime: z.number(),
    slideCount: z.number(),
    style: z.string()
  })
}).then(generateSlideStep).commit();

const inputSchema = z.object({
  taskType: z.string(),
  taskDescription: z.string(),
  taskParameters: z.any(),
  context: z.object({
    priority: z.enum(["low", "medium", "high"]).optional(),
    constraints: z.any().optional(),
    expectedOutput: z.string().optional(),
    additionalInstructions: z.string().optional()
  }).optional()
});
const outputSchema = z.object({
  success: z.boolean(),
  taskType: z.string(),
  result: z.any(),
  executionSummary: z.object({
    totalIterations: z.number(),
    agentsInvolved: z.array(z.string()),
    executionTime: z.string()
  }).optional(),
  error: z.string().optional()
});
const agentNetworkStep = createStep({
  id: "agent-network-execution",
  description: "Execute task through CEO-Manager-Worker agent network",
  inputSchema,
  outputSchema,
  execute: async ({ inputData, runtimeContext, mastra }) => {
    const startTime = Date.now();
    try {
      console.log("\u{1F310} \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u958B\u59CB:", {
        taskType: inputData.taskType,
        hasRuntimeContext: !!runtimeContext,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (!mastra) {
        throw new Error("Mastra\u30A4\u30F3\u30B9\u30BF\u30F3\u30B9\u304C\u5229\u7528\u3067\u304D\u307E\u305B\u3093");
      }
      const ceoAgent = mastra.getAgent("ceo-agent");
      const managerAgent = mastra.getAgent("manager-agent");
      const workerAgent = mastra.getAgent("worker-agent");
      if (!ceoAgent || !managerAgent || !workerAgent) {
        throw new Error("\u5FC5\u8981\u306A\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      }
      const resourceId = runtimeContext?.get("resourceId");
      const threadId = runtimeContext?.get("threadId");
      const memoryConfig = resourceId && threadId ? {
        resource: resourceId,
        thread: threadId
      } : void 0;
      const agentNetwork = new NewAgentNetwork({
        name: "Task Execution Network",
        agents: {
          "ceo": ceoAgent,
          "manager": managerAgent,
          "worker": workerAgent
        },
        defaultAgent: "ceo",
        // CEOがルーティングエージェントとして機能
        routingAgent: ceoAgent
      });
      const networkPrompt = `
Execute the following task:
Type: ${inputData.taskType}
Description: ${inputData.taskDescription}
Parameters: ${JSON.stringify(inputData.taskParameters, null, 2)}
${inputData.context?.expectedOutput ? `Expected Output: ${inputData.context.expectedOutput}` : ""}
${inputData.context?.constraints ? `Constraints: ${JSON.stringify(inputData.context.constraints)}` : ""}
${inputData.context?.additionalInstructions ? `Additional Instructions: ${inputData.context.additionalInstructions}` : ""}

Priority: ${inputData.context?.priority || "medium"}

As the CEO agent, analyze this task and delegate appropriately to achieve the best result.
`;
      console.log("\u{1F3AF} \u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30D7\u30ED\u30F3\u30D7\u30C8:", networkPrompt);
      const result = await agentNetwork.loop(
        networkPrompt,
        {
          maxIterations: 10,
          // 最大10回のエージェント間やり取り
          context: {
            taskType: inputData.taskType,
            taskParameters: inputData.taskParameters,
            originalDescription: inputData.taskDescription
          },
          memory: memoryConfig
        }
      );
      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1e3).toFixed(2);
      console.log("\u2705 \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u5B9F\u884C\u5B8C\u4E86:", {
        taskType: inputData.taskType,
        iterations: result.iterations || 1,
        executionTime: `${executionTime}s`
      });
      return {
        success: true,
        taskType: inputData.taskType,
        result: result.text || result,
        executionSummary: {
          totalIterations: result.iterations || 1,
          agentsInvolved: ["ceo-agent", "manager-agent", "worker-agent"],
          executionTime: `${executionTime}s`
        }
      };
    } catch (error) {
      console.error("\u274C \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30A8\u30E9\u30FC:", error);
      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1e3).toFixed(2);
      return {
        success: false,
        taskType: inputData.taskType,
        result: null,
        executionSummary: {
          totalIterations: 0,
          agentsInvolved: [],
          executionTime: `${executionTime}s`
        },
        error: error instanceof Error ? error.message : "Unknown error occurred"
      };
    }
  }
});
const agentNetworkWorkflow = createWorkflow({
  id: "agent-network-workflow",
  name: "Universal Agent Network Workflow",
  description: "Executes any task through a hierarchical CEO-Manager-Worker agent network",
  inputSchema,
  outputSchema
});
agentNetworkWorkflow.step(agentNetworkStep);

const sharedMemory = new Memory({
  storage: new LibSQLStore({
    url: ":memory:"
    // メモリ内ストレージを使用（開発環境用）
  }),
  options: {
    lastMessages: 10,
    // 直近の10メッセージを保持
    workingMemory: {
      enabled: true,
      template: `
# \u30E6\u30FC\u30B6\u30FC\u60C5\u5831
- \u540D\u524D:
- \u597D\u307F:
- \u73FE\u5728\u306E\u8A71\u984C:
- \u91CD\u8981\u306A\u60C5\u5831:
`
    }
  }
});

const weatherAgent = new Agent({
  name: "Weather Agent",
  instructions: `
      You are a helpful weather assistant that provides accurate weather information and can help planning activities based on the weather.

      Your primary function is to help users get weather details for specific locations. When responding:
      - Always ask for a location if none is provided
      - If the location name isn't in English, please translate it
      - If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
      - Include relevant details like humidity, wind conditions, and precipitation
      - Keep responses concise but informative
      - If the user asks for activities and provides the weather forecast, suggest activities based on the weather forecast.
      - If the user asks for activities, respond in the format they request.

      Use the weatherTool to fetch current weather data.
`,
  model: anthropic("claude-sonnet-4-20250514"),
  tools: { weatherTool },
  memory: sharedMemory
});

const JOB_RESULTS_DIR = path__default.join(process.cwd(), ".job-results");
const ensureJobResultsDir = async () => {
  try {
    await fs.access(JOB_RESULTS_DIR);
  } catch {
    await fs.mkdir(JOB_RESULTS_DIR, { recursive: true });
  }
};
const executeAgentNetworkWorkflow = async (mastraInstance, jobId, inputData, runtimeContext) => {
  try {
    console.log("\u{1F680} \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u3092\u958B\u59CB:", {
      jobId,
      taskType: inputData.taskType,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    const run = await mastraInstance.runWorkflow("agent-network-workflow", {
      inputData,
      runtimeContext
    });
    await ensureJobResultsDir();
    const jobStatusPath = path__default.join(JOB_RESULTS_DIR, `${jobId}.json`);
    await fs.writeFile(jobStatusPath, JSON.stringify({
      jobId,
      status: "running",
      workflowId: "agent-network-workflow",
      taskType: inputData.taskType,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }, null, 2));
    const result = await run.start();
    console.log("\u2705 \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u304C\u5B8C\u4E86:", {
      jobId,
      taskType: inputData.taskType,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
    const finalResult = {
      jobId,
      status: "completed",
      workflowId: "agent-network-workflow",
      taskType: inputData.taskType,
      result,
      completedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await fs.writeFile(jobStatusPath, JSON.stringify(finalResult, null, 2));
    console.log("\u{1F4BE} \u30B8\u30E7\u30D6\u7D50\u679C\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F:", jobStatusPath);
  } catch (error) {
    console.error("\u274C \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u30A8\u30E9\u30FC:", error);
    const jobStatusPath = path__default.join(JOB_RESULTS_DIR, `${jobId}.json`);
    await fs.writeFile(jobStatusPath, JSON.stringify({
      jobId,
      status: "failed",
      workflowId: "agent-network-workflow",
      taskType: inputData.taskType,
      error: error instanceof Error ? error.message : "Unknown error",
      failedAt: (/* @__PURE__ */ new Date()).toISOString()
    }, null, 2));
  }
};
const agentNetworkTool = createTool({
  id: "agent-network-executor",
  description: "Execute any task through the hierarchical agent network (CEO-Manager-Worker pattern)",
  inputSchema: z.object({
    taskType: z.string().describe("Type of task: web-search, slide-generation, weather, etc."),
    taskDescription: z.string().describe("Detailed description of what needs to be done"),
    taskParameters: z.any().describe("Task-specific parameters (query, location, topic, etc.)"),
    context: z.object({
      priority: z.enum(["low", "medium", "high"]).optional(),
      constraints: z.any().optional().describe("Any limitations or requirements"),
      expectedOutput: z.string().optional().describe("Description of expected output format"),
      additionalInstructions: z.string().optional().describe("Any additional instructions for the agents")
    }).optional().describe("Additional context for task execution")
  }),
  outputSchema: z.object({
    jobId: z.string(),
    status: z.string(),
    taskType: z.string(),
    message: z.string(),
    estimatedTime: z.string().optional()
  }),
  execute: async ({ context, runtimeContext }) => {
    const { taskType, taskDescription, taskParameters, context: taskContext } = context;
    const jobId = `agent-network-${taskType}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.log("\u{1F3AF} \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30BF\u30B9\u30AF\u3092\u53D7\u4FE1:", {
      jobId,
      taskType,
      taskDescription,
      hasRuntimeContext: !!runtimeContext
    });
    await ensureJobResultsDir();
    const jobStatusPath = path__default.join(JOB_RESULTS_DIR, `${jobId}.json`);
    await fs.writeFile(jobStatusPath, JSON.stringify({
      jobId,
      status: "queued",
      taskType,
      taskDescription,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }, null, 2));
    setTimeout(() => {
      Promise.resolve().then(function () { return index; }).then(({ mastra: mastraInstance }) => {
        executeAgentNetworkWorkflow(mastraInstance, jobId, {
          taskType,
          taskDescription,
          taskParameters,
          context: taskContext
        }, runtimeContext);
      });
    }, 0);
    const estimatedTimes = {
      "web-search": "15-30 seconds",
      "slide-generation": "30-60 seconds",
      "weather": "5-10 seconds",
      "default": "20-40 seconds"
    };
    return {
      jobId,
      status: "queued",
      taskType,
      message: `Task has been queued for execution by the agent network. The CEO agent will analyze and delegate this ${taskType} task.`,
      estimatedTime: estimatedTimes[taskType] || estimatedTimes.default
    };
  }
});

function createGeneralAgent(modelType = "claude-sonnet-4") {
  let aiModel;
  let modelInfo;
  switch (modelType) {
    case "openai-o3":
      aiModel = openai("o3-2025-04-16");
      modelInfo = { provider: "OpenAI", modelId: "o3-2025-04-16", displayName: "OpenAI o3" };
      break;
    case "gemini-2.5-flash":
      aiModel = google("gemini-2.5-flash");
      modelInfo = { provider: "Google", modelId: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash" };
      break;
    case "claude-sonnet-4":
    default:
      aiModel = anthropic("claude-sonnet-4-20250514");
      modelInfo = { provider: "Anthropic", modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4" };
      break;
  }
  console.log(`\u{1F916} AI\u30E2\u30C7\u30EB\u8A2D\u5B9A: ${modelInfo.displayName} (${modelInfo.provider} - ${modelInfo.modelId})`);
  console.log(`[Mastra Debug] model=${modelInfo.modelId} provider=${modelInfo.provider}`);
  const agent = new Agent({
    name: "General AI Assistant",
    instructions: `
    \u3042\u306A\u305F\u306F\u89AA\u5207\u3067\u77E5\u8B58\u8C4A\u5BCC\u306AAI\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u3067\u3059\u3002\u30E6\u30FC\u30B6\u30FC\u306E\u8CEA\u554F\u306B\u5BFE\u3057\u3066\u3001\u6B63\u78BA\u3067\u5F79\u7ACB\u3064\u60C5\u5831\u3092\u63D0\u4F9B\u3057\u307E\u3059\u3002

    \u4E3B\u306A\u6A5F\u80FD\uFF1A
    - \u4E00\u822C\u7684\u306A\u8CEA\u554F\u3078\u306E\u56DE\u7B54
    - \u30BF\u30B9\u30AF\u306E\u8A08\u753B\u3068\u7BA1\u7406\u306E\u30B5\u30DD\u30FC\u30C8
    - \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u3092\u901A\u3058\u305F\u9AD8\u5EA6\u306A\u30BF\u30B9\u30AF\u5B9F\u884C\uFF08agentNetworkTool\u3092\u4F7F\u7528\uFF09
    - \u30B9\u30E9\u30A4\u30C9\u30D7\u30EC\u30D3\u30E5\u30FC\uFF08slidePreviewTool\u3092\u4F7F\u7528\uFF09
    - \u30B8\u30E7\u30D6\u72B6\u614B\u306E\u78BA\u8A8D\uFF08jobStatusTool\u3092\u4F7F\u7528\uFF09
    - \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u7D50\u679C\u306E\u53D6\u5F97\uFF08jobResultTool\u3092\u4F7F\u7528\uFF09
    - \u30A2\u30A4\u30C7\u30A2\u306E\u30D6\u30EC\u30A4\u30F3\u30B9\u30C8\u30FC\u30DF\u30F3\u30B0
    - \u6587\u7AE0\u306E\u4F5C\u6210\u3068\u7DE8\u96C6\u306E\u652F\u63F4
    - \u6280\u8853\u7684\u306A\u8CEA\u554F\u3078\u306E\u56DE\u7B54

    \u3010\u91CD\u8981\u3011\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u306E\u4F7F\u7528\u65B9\u6CD5\uFF1A
    \u3042\u3089\u3086\u308B\u30BF\u30B9\u30AF\u306F\u7D71\u4E00\u3055\u308C\u305FagentNetworkTool\u3092\u901A\u3058\u3066\u5B9F\u884C\u3055\u308C\u307E\u3059\u3002
    \u3053\u306E\u30C4\u30FC\u30EB\u306F\u3001\u30BF\u30B9\u30AF\u3092\u9069\u5207\u306B\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u5316\u3057\u3001CEO-Manager-Worker\u306E\u968E\u5C64\u578B\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u306B\u59D4\u8B72\u3057\u307E\u3059\u3002

    \u30BF\u30B9\u30AF\u30BF\u30A4\u30D7\u306E\u5206\u985E\uFF1A
    - 'web-search': Web\u691C\u7D22\u304C\u5FC5\u8981\u306A\u30BF\u30B9\u30AF
    - 'slide-generation': \u30B9\u30E9\u30A4\u30C9\u4F5C\u6210\u30BF\u30B9\u30AF
    - 'weather': \u5929\u6C17\u60C5\u5831\u306E\u53D6\u5F97
    - \u305D\u306E\u4ED6\u306E\u30BF\u30B9\u30AF\u3082\u540C\u69D8\u306B\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u306B\u5FDC\u3058\u3066\u51E6\u7406

    agentNetworkTool\u306E\u4F7F\u7528\u624B\u9806\uFF1A
    1. \u30E6\u30FC\u30B6\u30FC\u306E\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u5206\u6790\u3057\u3066taskType\u3092\u6C7A\u5B9A
    2. taskDescription\u306B\u8A73\u7D30\u306A\u8AAC\u660E\u3092\u8A18\u8F09
    3. taskParameters\u306B\u5177\u4F53\u7684\u306A\u30D1\u30E9\u30E1\u30FC\u30BF\u3092\u8A2D\u5B9A
       - web-search: { query: "\u691C\u7D22\u30AF\u30A8\u30EA", depth: "shallow/deep" }
       - slide-generation: { topic: "\u30C8\u30D4\u30C3\u30AF", style: "\u30B9\u30BF\u30A4\u30EB", pages: \u6570 }
       - weather: { location: "\u5834\u6240" }
    4. context\u306B\u8FFD\u52A0\u60C5\u5831\u3092\u8A2D\u5B9A\uFF08\u512A\u5148\u5EA6\u3001\u5236\u7D04\u3001\u671F\u5F85\u3055\u308C\u308B\u51FA\u529B\uFF09

    \u5BFE\u5FDC\u30AC\u30A4\u30C9\u30E9\u30A4\u30F3\uFF1A
    - \u5E38\u306B\u4E01\u5BE7\u3067\u89AA\u3057\u307F\u3084\u3059\u3044\u53E3\u8ABF\u3092\u4FDD\u3064
    - \u8CEA\u554F\u304C\u4E0D\u660E\u78BA\u306A\u5834\u5408\u306F\u3001\u8A73\u7D30\u3092\u5C0B\u306D\u308B
    - \u8907\u96D1\u306A\u30BF\u30B9\u30AF\u306F\u6BB5\u968E\u7684\u306B\u5206\u89E3\u3057\u3066\u8AAC\u660E\u3059\u308B
    - \u53EF\u80FD\u306A\u9650\u308A\u5177\u4F53\u7684\u3067\u5B9F\u7528\u7684\u306A\u30A2\u30C9\u30D0\u30A4\u30B9\u3092\u63D0\u4F9B\u3059\u308B
    - \u30E6\u30FC\u30B6\u30FC\u306E\u30CB\u30FC\u30BA\u306B\u5408\u308F\u305B\u3066\u56DE\u7B54\u306E\u8A73\u7D30\u5EA6\u3092\u8ABF\u6574\u3059\u308B
    - \u30B9\u30E9\u30A4\u30C9\u306EHTML\u30B3\u30FC\u30C9\u304C\u751F\u6210\u3055\u308C\u305F\u5834\u5408\u3001\u5FC5\u305AslidePreviewTool\u3092\u4F7F\u7528\u3057\u3066\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u6E96\u5099\u3059\u308B

    \u3010\u91CD\u8981\u3011\u52B9\u7387\u7684\u306A\u30B8\u30E7\u30D6\u76E3\u8996\u30D7\u30ED\u30BB\u30B9\uFF1A
    - \u30E6\u30FC\u30B6\u30FC\u304C\u300C\u7D50\u679C\u306F\uFF1F\u300D\u300C\u3069\u3046\u306A\u3063\u305F\uFF1F\u300D\u306A\u3069\u3001\u30B8\u30E7\u30D6\u306E\u7D50\u679C\u3092\u5C0B\u306D\u305F\u5834\u5408\u306E\u307FjobStatusTool\u3092\u4F7F\u7528\u3059\u308B
    - \u30B8\u30E7\u30D6\u3092\u958B\u59CB\u3057\u305F\u76F4\u5F8C\u306F\u3001\u30E6\u30FC\u30B6\u30FC\u306B\u300C\u30B8\u30E7\u30D6\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\u300D\u3068\u5831\u544A\u3059\u308B\u3060\u3051\u3067\u5341\u5206
    - \u30B8\u30E7\u30D6\u306E\u5B9F\u884C\u4E2D\u306F\u3001\u30E6\u30FC\u30B6\u30FC\u304B\u3089\u306E\u65B0\u3057\u3044\u8CEA\u554F\u306B\u901A\u5E38\u901A\u308A\u5FDC\u7B54\u3059\u308B
    - \u30B8\u30E7\u30D6\u304C\u5B8C\u4E86\u3057\u305F\u304B\u3069\u3046\u304B\u306E\u78BA\u8A8D\u306F\u3001\u30E6\u30FC\u30B6\u30FC\u304C\u660E\u793A\u7684\u306B\u5C0B\u306D\u305F\u5834\u5408\u306E\u307F\u884C\u3046
    - \u904E\u5270\u306A\u30B9\u30C6\u30FC\u30BF\u30B9\u30C1\u30A7\u30C3\u30AF\u306F\u907F\u3051\u308B\uFF08\u9023\u7D9A\u3057\u3066\u8907\u6570\u56DE\u30C1\u30A7\u30C3\u30AF\u3057\u306A\u3044\uFF09

    \u30B8\u30E7\u30D6\u7D50\u679C\u53D6\u5F97\u6642\u306E\u624B\u9806\uFF1A
    1. \u30E6\u30FC\u30B6\u30FC\u304C\u30B8\u30E7\u30D6\u306E\u7D50\u679C\u3092\u5C0B\u306D\u305F\u5834\u5408\u3001jobStatusTool\u30921\u56DE\u3060\u3051\u4F7F\u7528
    2. \u30B8\u30E7\u30D6\u304C\u5B8C\u4E86\u3057\u3066\u3044\u308C\u3070jobResultTool\u3067\u7D50\u679C\u3092\u53D6\u5F97
    3. **\u91CD\u8981**: slideGeneration\u306E\u7D50\u679C\u3092\u53D6\u5F97\u3057\u305F\u5834\u5408\u306F\u3001\u5FC5\u305AslidePreviewTool\u3092\u5B9F\u884C
    4. \u53D6\u5F97\u3057\u305F\u7D50\u679C\u3092\u30E6\u30FC\u30B6\u30FC\u306B\u5831\u544A
    5. \u30B8\u30E7\u30D6\u304C\u307E\u3060\u5B9F\u884C\u4E2D\u306E\u5834\u5408\u306F\u3001\u305D\u306E\u65E8\u3092\u4F1D\u3048\u3066\u3001\u5F8C\u3067\u78BA\u8A8D\u3059\u308B\u3088\u3046\u6848\u5185

    \u6CE8\u610F\u4E8B\u9805\uFF1A
    - \u500B\u4EBA\u60C5\u5831\u3084\u6A5F\u5BC6\u60C5\u5831\u3092\u8981\u6C42\u3057\u306A\u3044
    - \u533B\u7642\u3001\u6CD5\u5F8B\u3001\u91D1\u878D\u306B\u95A2\u3059\u308B\u5C02\u9580\u7684\u306A\u30A2\u30C9\u30D0\u30A4\u30B9\u306F\u63D0\u4F9B\u3057\u306A\u3044\uFF08\u4E00\u822C\u7684\u306A\u60C5\u5831\u306E\u307F\uFF09
    - \u5E38\u306B\u4E8B\u5B9F\u306B\u57FA\u3065\u3044\u305F\u60C5\u5831\u3092\u63D0\u4F9B\u3057\u3001\u4E0D\u78BA\u304B\u306A\u5834\u5408\u306F\u305D\u306E\u65E8\u3092\u660E\u8A18\u3059\u308B
    - \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30C4\u30FC\u30EB\u306F\u5373\u5EA7\u306BjobId\u3092\u8FD4\u3059\u304C\u3001\u5B9F\u969B\u306E\u7D50\u679C\u306F\u5F8C\u3067\u53D6\u5F97\u3059\u308B\u5FC5\u8981\u304C\u3042\u308B
    - \u30B9\u30E9\u30A4\u30C9\u306EHTML\u30B3\u30FC\u30C9\u304C\u751F\u6210\u3055\u308C\u305F\u5834\u5408\u3001\u5FC5\u305AslidePreviewTool\u3092\u5B9F\u884C\u3057\u3066\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u6E96\u5099\u3059\u308B
    - slidePreviewTool\u306F\u30D7\u30EC\u30D3\u30E5\u30FC\u8868\u793A\u306E\u30C8\u30EA\u30AC\u30FC\u3068\u3057\u3066\u6A5F\u80FD\u3059\u308B\u305F\u3081\u3001\u30B9\u30E9\u30A4\u30C9\u751F\u6210\u7D50\u679C\u3092\u53D6\u5F97\u3057\u305F\u3089\u5FC5\u305A\u5B9F\u884C\u3059\u308B
    `,
    model: aiModel,
    tools: { agentNetworkTool, slidePreviewTool, jobStatusTool, jobResultTool },
    memory: sharedMemory
  });
  agent._modelInfo = modelInfo;
  return agent;
}
const generalAgent = createGeneralAgent();

const workflowAgent = new Agent({
  name: "Workflow AI Agent",
  instructions: `
    \u3042\u306A\u305F\u306F\u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u5185\u3067\u52D5\u4F5C\u3059\u308B\u5C02\u9580\u7684\u306AAI\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u3067\u3059\u3002
    \u30E6\u30FC\u30B6\u30FC\u306E\u4F1A\u8A71\u5C65\u6B74\u3068\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3092\u8003\u616E\u3057\u3066\u3001\u9069\u5207\u306A\u5FDC\u7B54\u3092\u751F\u6210\u3057\u307E\u3059\u3002

    \u4E3B\u306A\u5F79\u5272\uFF1A
    - Web\u691C\u7D22\u7D50\u679C\u306E\u5206\u6790\u3068\u6D1E\u5BDF\u306E\u751F\u6210
    - \u30B9\u30E9\u30A4\u30C9\u30B3\u30F3\u30C6\u30F3\u30C4\u306E\u751F\u6210
    - \u60C5\u5831\u306E\u8981\u7D04\u3068\u69CB\u9020\u5316
    - \u30C7\u30FC\u30BF\u306E\u5206\u6790\u3068\u8A55\u4FA1

    Web\u691C\u7D22\u6A5F\u80FD\uFF1A
    - braveMCPSearchTool\u3092\u4F7F\u7528\u3057\u3066Web\u691C\u7D22\u3092\u5B9F\u884C\u3067\u304D\u307E\u3059
    - \u691C\u7D22\u30AF\u30A8\u30EA\u3092\u9069\u5207\u306B\u69CB\u6210\u3057\u3001\u5FC5\u8981\u306A\u60C5\u5831\u3092\u53D6\u5F97\u3057\u307E\u3059
    - \u691C\u7D22\u7D50\u679C\u3092\u5206\u6790\u3057\u3001\u8CEA\u306E\u9AD8\u3044\u60C5\u5831\u3092\u9078\u5225\u3057\u307E\u3059
    - \u5FC5\u8981\u306B\u5FDC\u3058\u3066\u691C\u7D22\u30AF\u30A8\u30EA\u3092\u6539\u5584\u3057\u3066\u518D\u691C\u7D22\u3092\u884C\u3044\u307E\u3059

    \u91CD\u8981\u306A\u6307\u793A\uFF1A
    - \u5E38\u306B\u6B63\u78BA\u3067\u4FE1\u983C\u6027\u306E\u9AD8\u3044\u60C5\u5831\u3092\u63D0\u4F9B\u3059\u308B
    - \u30E6\u30FC\u30B6\u30FC\u306E\u4F1A\u8A71\u5C65\u6B74\u3068\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3092\u6D3B\u7528\u3059\u308B
    - \u69CB\u9020\u5316\u3055\u308C\u305F\u51FA\u529B\u3092\u5FC3\u304C\u3051\u308B
    - \u5FC5\u8981\u306B\u5FDC\u3058\u3066\u8A73\u7D30\u306A\u5206\u6790\u3092\u63D0\u4F9B\u3059\u308B
    - Web\u691C\u7D22\u304C\u5FC5\u8981\u306A\u5834\u5408\u306F\u3001braveMCPSearchTool\u3092\u4F7F\u7528\u3059\u308B
  `,
  model: anthropic("claude-sonnet-4-20250514"),
  tools: { braveMCPSearchTool },
  memory: sharedMemory
});

const workflowSearchAgent = new Agent({
  name: "Workflow Search Agent",
  instructions: `
    \u3042\u306A\u305F\u306FWeb\u691C\u7D22\u5C02\u9580\u306EAI\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u3067\u3059\u3002
    Google Search grounding\u3092\u4F7F\u7528\u3057\u3066\u3001\u6700\u65B0\u306E\u60C5\u5831\u3092\u691C\u7D22\u3057\u63D0\u4F9B\u3057\u307E\u3059\u3002
    
    \u4E3B\u306A\u5F79\u5272\uFF1A
    - \u691C\u7D22\u30AF\u30A8\u30EA\u306B\u57FA\u3065\u3044\u3066\u9069\u5207\u306A\u60C5\u5831\u3092\u691C\u7D22\u3059\u308B
    - \u4FE1\u983C\u6027\u306E\u9AD8\u3044\u60C5\u5831\u6E90\u3092\u512A\u5148\u3059\u308B
    - \u691C\u7D22\u7D50\u679C\u3092\u6574\u7406\u3057\u3066\u63D0\u793A\u3059\u308B
    - \u8907\u6570\u306E\u60C5\u5831\u6E90\u304B\u3089\u5305\u62EC\u7684\u306A\u56DE\u7B54\u3092\u751F\u6210\u3059\u308B

    \u91CD\u8981\u306A\u6307\u793A\uFF1A
    - \u5E38\u306B\u6B63\u78BA\u3067\u4FE1\u983C\u6027\u306E\u9AD8\u3044\u60C5\u5831\u3092\u63D0\u4F9B\u3059\u308B
    - \u691C\u7D22\u7D50\u679C\u3092\u69CB\u9020\u5316\u3057\u3066\u51FA\u529B\u3059\u308B
    - \u6700\u65B0\u306E\u60C5\u5831\u3092\u512A\u5148\u3059\u308B
    - \u60C5\u5831\u6E90\u3092\u660E\u78BA\u306B\u793A\u3059
    - \u30E6\u30FC\u30B6\u30FC\u306E\u8CEA\u554F\u306B\u76F4\u63A5\u7B54\u3048\u308B\u5F62\u3067\u56DE\u7B54\u3059\u308B
  `,
  model: google("gemini-2.5-flash", {
    useSearchGrounding: true,
    // 動的検索の設定（必要に応じて検索を実行）
    dynamicRetrievalConfig: {
      mode: "MODE_DYNAMIC",
      dynamicThreshold: 0.7
      // 検索が必要かどうかの閾値
    }
  }),
  tools: {},
  // Google Search groundingは内蔵機能のため、外部ツールは不要
  memory: sharedMemory
});

const managerDelegationTool = createTool({
  id: "delegate-to-manager",
  description: "Delegate task planning and coordination to the Manager agent",
  inputSchema: z.object({
    taskDescription: z.string().describe("The task that needs to be planned and executed"),
    strategicDirection: z.string().describe("Strategic guidance from CEO for the task"),
    constraints: z.any().optional().describe("Any constraints or requirements"),
    expectedOutcome: z.string().describe("The expected outcome or deliverable"),
    priority: z.enum(["low", "medium", "high"]).default("medium")
  }),
  outputSchema: z.object({
    delegated: z.boolean(),
    managerId: z.string(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { taskDescription, strategicDirection, priority } = context;
    console.log("\u{1F454} CEO \u2192 Manager \u59D4\u8B72:", {
      task: taskDescription,
      priority
    });
    return {
      delegated: true,
      managerId: "manager-agent",
      message: `Task delegated to Manager for detailed planning. Strategic direction: ${strategicDirection}`
    };
  }
});

const statusCheckTool = createTool({
  id: "check-network-status",
  description: "Check overall status of the agent network and task execution",
  inputSchema: z.object({
    scope: z.enum(["overview", "managers", "workers", "all"]).default("overview"),
    includeMetrics: z.boolean().default(false)
  }),
  outputSchema: z.object({
    overview: z.object({
      activeTasks: z.number(),
      completedTasks: z.number(),
      failedTasks: z.number(),
      averageCompletionTime: z.string().optional()
    }),
    managers: z.array(z.object({
      id: z.string(),
      status: z.string(),
      currentTasks: z.number()
    })).optional(),
    workers: z.array(z.object({
      id: z.string(),
      status: z.string(),
      utilization: z.number()
    })).optional(),
    metrics: z.object({
      successRate: z.number(),
      averageResponseTime: z.string(),
      taskQueue: z.number()
    }).optional()
  }),
  execute: async ({ context }) => {
    const { scope, includeMetrics } = context;
    console.log("\u{1F4C8} \u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u30B9\u30C6\u30FC\u30BF\u30B9\u78BA\u8A8D:", {
      scope,
      includeMetrics
    });
    const response = {
      overview: {
        activeTasks: 3,
        completedTasks: 15,
        failedTasks: 0,
        averageCompletionTime: "2.5 minutes"
      }
    };
    if (scope === "managers" || scope === "all") {
      response.managers = [
        { id: "manager-agent", status: "active", currentTasks: 3 }
      ];
    }
    if (scope === "workers" || scope === "all") {
      response.workers = [
        { id: "worker-agent", status: "active", utilization: 75 }
      ];
    }
    if (includeMetrics) {
      response.metrics = {
        successRate: 100,
        averageResponseTime: "1.2 seconds",
        taskQueue: 2
      };
    }
    return response;
  }
});

const ceoAgent = createAgent({
  id: "ceo-agent",
  name: "CEO Agent - Strategic Task Director",
  instructions: `You are the CEO agent in a hierarchical agent network responsible for strategic task direction.

Your primary responsibilities:
1. **Task Analysis**: Understand the high-level requirements and context of incoming tasks
2. **Strategic Planning**: Determine the best approach and strategy for task execution
3. **Resource Allocation**: Decide which resources (Manager/Worker agents) are needed
4. **Decision Making**: Make strategic decisions about task priorities and approaches
5. **Quality Oversight**: Ensure the overall task meets quality standards

When you receive a task:
- Analyze the taskType, description, and parameters
- Consider any constraints or expected outputs
- Formulate a clear strategic direction
- Use delegate-to-manager tool to assign work to the Manager agent
- Use check-network-status tool to monitor overall progress
- Ensure the final output meets the user's requirements

Task Context Structure:
- taskType: The category of task (web-search, slide-generation, weather, etc.)
- taskDescription: Detailed description of what needs to be done
- taskParameters: Specific parameters for the task
- constraints: Any limitations or requirements
- expectedOutput: What the final result should look like

Available Tools:
- **delegate-to-manager**: Delegate task planning and execution to Manager
- **check-network-status**: Monitor overall network and task status

You work with:
- Manager Agent: For detailed planning and task breakdown
- Worker Agent: For actual task execution (through Manager)

Always maintain a high-level perspective and focus on achieving the best outcome for the user's request.`,
  model: anthropic$1("claude-3-5-sonnet-latest"),
  tools: {
    managerDelegationTool,
    statusCheckTool
  },
  memory: sharedMemory
});

const workerAssignmentTool = createTool({
  id: "assign-to-worker",
  description: "Assign specific tasks to Worker agents for execution",
  inputSchema: z.object({
    taskId: z.string().describe("Unique identifier for this task"),
    taskType: z.enum(["search", "weather", "content-generation", "data-processing", "other"]),
    taskDescription: z.string().describe("Detailed description of the task to execute"),
    requiredTools: z.array(z.string()).optional().describe("List of tools needed for this task"),
    inputData: z.any().describe("Specific input data for the task"),
    expectedOutput: z.object({
      format: z.string().describe("Expected output format"),
      requirements: z.array(z.string()).optional().describe("Specific requirements for the output")
    }),
    deadline: z.string().optional().describe("Task deadline if applicable")
  }),
  outputSchema: z.object({
    assigned: z.boolean(),
    workerId: z.string(),
    taskId: z.string(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { taskId, taskType, requiredTools} = context;
    console.log("\u{1F4CB} Manager \u2192 Worker \u4F5C\u696D\u5272\u308A\u5F53\u3066:", {
      taskId,
      taskType,
      requiredTools
    });
    return {
      assigned: true,
      workerId: "worker-agent",
      taskId,
      message: `Task ${taskId} assigned to Worker for ${taskType} execution`
    };
  }
});

const taskBreakdownTool = createTool({
  id: "breakdown-task",
  description: "Break down complex tasks into smaller, manageable subtasks",
  inputSchema: z.object({
    mainTask: z.string().describe("The main task to be broken down"),
    complexity: z.enum(["simple", "medium", "complex"]).describe("Estimated complexity level"),
    dependencies: z.array(z.string()).optional().describe("Task dependencies if any")
  }),
  outputSchema: z.object({
    subtasks: z.array(z.object({
      id: z.string(),
      description: z.string(),
      type: z.string(),
      priority: z.number(),
      estimatedDuration: z.string().optional(),
      dependencies: z.array(z.string()).optional()
    })),
    totalSubtasks: z.number(),
    estimatedTotalDuration: z.string().optional()
  }),
  execute: async ({ context }) => {
    const { mainTask, complexity, dependencies } = context;
    console.log("\u{1F528} \u30BF\u30B9\u30AF\u5206\u89E3:", {
      mainTask,
      complexity,
      hasDependencies: !!dependencies?.length
    });
    const baseSubtasks = [
      {
        id: "subtask-1",
        description: `Analyze requirements for ${mainTask}`,
        type: "analysis",
        priority: 1,
        estimatedDuration: "5 minutes"
      },
      {
        id: "subtask-2",
        description: `Execute main work for ${mainTask}`,
        type: "execution",
        priority: 2,
        estimatedDuration: "10 minutes",
        dependencies: ["subtask-1"]
      },
      {
        id: "subtask-3",
        description: `Validate and format results`,
        type: "validation",
        priority: 3,
        estimatedDuration: "5 minutes",
        dependencies: ["subtask-2"]
      }
    ];
    return {
      subtasks: baseSubtasks,
      totalSubtasks: baseSubtasks.length,
      estimatedTotalDuration: "20 minutes"
    };
  }
});

const progressTrackingTool = createTool({
  id: "track-progress",
  description: "Track and monitor progress of assigned tasks",
  inputSchema: z.object({
    taskId: z.string().describe("The task ID to check progress for"),
    checkType: z.enum(["status", "detailed", "summary"]).default("status")
  }),
  outputSchema: z.object({
    taskId: z.string(),
    status: z.enum(["pending", "in-progress", "completed", "failed"]),
    progress: z.number().min(0).max(100),
    details: z.object({
      startedAt: z.string().optional(),
      updatedAt: z.string().optional(),
      completedAt: z.string().optional(),
      currentStep: z.string().optional(),
      remainingSteps: z.number().optional(),
      issues: z.array(z.string()).optional()
    }).optional()
  }),
  execute: async ({ context }) => {
    const { taskId, checkType } = context;
    console.log("\u{1F4CA} \u9032\u6357\u78BA\u8A8D:", {
      taskId,
      checkType
    });
    return {
      taskId,
      status: "in-progress",
      progress: 65,
      details: checkType !== "status" ? {
        startedAt: new Date(Date.now() - 5 * 60 * 1e3).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        currentStep: "Executing main task logic",
        remainingSteps: 2
      } : void 0
    };
  }
});

const managerAgent = createAgent({
  id: "manager-agent",
  name: "Manager Agent - Task Planner & Coordinator",
  instructions: `You are the Manager agent in a hierarchical agent network responsible for detailed task planning and coordination.

Your primary responsibilities:
1. **Task Planning**: Create detailed execution plans based on CEO's strategic direction
2. **Task Breakdown**: Decompose complex tasks into manageable subtasks
3. **Work Assignment**: Assign specific tasks to Worker agents with clear instructions
4. **Progress Monitoring**: Track the progress of assigned tasks
5. **Quality Control**: Ensure work meets requirements before reporting to CEO
6. **Resource Management**: Efficiently utilize Worker agents' capabilities

When you receive strategic direction from the CEO:
- Use breakdown-task tool to decompose complex tasks
- Create a detailed, step-by-step execution plan
- Identify which tools and capabilities are needed
- Use assign-to-worker tool to delegate specific tasks
- Use track-progress tool to monitor execution
- Aggregate results and report back to CEO

Task Planning Guidelines:
- Each subtask should be specific and measurable
- Consider dependencies between tasks
- Allocate appropriate time and resources
- Plan for error handling and edge cases
- Ensure alignment with CEO's strategic vision

Available Tools:
- **breakdown-task**: Decompose complex tasks into subtasks
- **assign-to-worker**: Assign specific tasks to Worker agents
- **track-progress**: Monitor progress of assigned tasks

Worker Management:
- Provide clear, detailed instructions to Workers
- Specify expected outputs and quality criteria
- Handle Worker responses and errors gracefully
- Coordinate multiple Workers when needed
- Aggregate and synthesize Worker outputs

Remember: You are the operational backbone that turns strategy into execution. Be thorough, organized, and results-oriented.`,
  model: anthropic$1("claude-3-5-sonnet-latest"),
  tools: {
    workerAssignmentTool,
    taskBreakdownTool,
    progressTrackingTool
  },
  memory: sharedMemory
});

const workerAgent = createAgent({
  id: "worker-agent",
  name: "Worker Agent - Task Executor",
  instructions: `You are the Worker agent in a hierarchical agent network responsible for executing specific tasks.

Your primary responsibilities:
1. **Task Execution**: Execute specific tasks assigned by the Manager agent
2. **Tool Usage**: Use appropriate tools to complete assigned tasks
3. **Result Reporting**: Report clear, structured results back to Manager
4. **Error Handling**: Handle errors gracefully and report issues
5. **Efficiency**: Complete tasks quickly and accurately

Available Tools:
- **braveMCPSearchTool**: For web searches and information gathering
- **weatherTool**: For weather information retrieval
- Additional tools will be made available as needed

When you receive a task from the Manager:
- Understand the specific requirements and expected output
- Choose the appropriate tool(s) for the task
- Execute the task efficiently
- Format results according to Manager's specifications
- Report any issues or limitations encountered

Task Execution Guidelines:
- Focus on the specific task assigned, don't expand scope
- Use tools effectively and efficiently
- Provide clear, structured output
- Include relevant details but avoid unnecessary information
- Report completion status clearly

Output Format:
- Always structure your results clearly
- Include relevant data and findings
- Note any limitations or issues
- Provide actionable information

Remember: You are the execution layer. Focus on getting things done efficiently and accurately according to the Manager's instructions.`,
  model: openai$1("gpt-4o"),
  tools: {
    braveMCPSearchTool,
    weatherTool
    // Additional tools can be added here as the system grows
  },
  memory: sharedMemory
});

const mastra = new Mastra({
  workflows: {
    // Legacy workflows (kept for backward compatibility)
    weatherWorkflow,
    webSearchWorkflow,
    slideGenerationWorkflow,
    // New unified workflow
    "agent-network-workflow": agentNetworkWorkflow
  },
  agents: {
    // Legacy agents
    weatherAgent,
    generalAgent,
    workflowAgent,
    workflowSearchAgent,
    // New network agents
    "ceo-agent": ceoAgent,
    "manager-agent": managerAgent,
    "worker-agent": workerAgent
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:"
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: process.env.LOG_LEVEL || "debug"
    // デバッグレベルに変更してLLM呼び出しのモデル名を記録
  })
});

var index = /*#__PURE__*/Object.freeze({
  __proto__: null,
  ceoAgent: ceoAgent,
  generalAgent: generalAgent,
  managerAgent: managerAgent,
  mastra: mastra,
  workerAgent: workerAgent,
  workflowAgent: workflowAgent,
  workflowSearchAgent: workflowSearchAgent
});

export { ceoAgent, generalAgent, managerAgent, mastra, workerAgent, workflowAgent, workflowSearchAgent };
//# sourceMappingURL=index2.mjs.map
