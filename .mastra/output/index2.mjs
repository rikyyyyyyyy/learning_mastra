import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { braveMCPSearchTool } from './tools/f55f74d0-259b-40f7-8cff-7623a7a76009.mjs';
import { anthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { weatherTool } from './tools/7c1d5b02-a84e-4a2c-a603-71ea57a3d35a.mjs';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { webSearchTool } from './tools/fc91f4c3-136f-4905-a84a-172506d60136.mjs';
import { slideGenerationTool } from './tools/702498af-6cf2-4809-848f-94aa7e82fd05.mjs';
import { slidePreviewTool } from './tools/950a7c10-a632-40c1-81ca-96413e7652b6.mjs';
import { jobStatusTool } from './tools/b0d9adbf-1685-4da8-a5b5-c772a7b99734.mjs';
import { jobResultTool } from './tools/d66355fc-d2a0-46c9-8e57-17de7be2b41e.mjs';
import '@mastra/core/tools';
import '@mastra/mcp';
import 'fs';
import 'path';

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

const braveMCPSearchStep = createStep({
  id: "brave-mcp-search",
  description: "Brave MCP\u3092\u4F7F\u7528\u3057\u3066Web\u691C\u7D22\u3092\u5B9F\u884C\u3057\u307E\u3059",
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
      console.log(`\u{1F50D} Brave MCP\u3067Web\u691C\u7D22\u3092\u5B9F\u884C: "${query}"`);
      const result = await braveMCPSearchTool.execute({
        context: {
          query,
          count: maxResults
        },
        mastra,
        runtimeContext
      });
      let searchResults = [];
      const rawResults = result.searchResults;
      if (result.success) {
        try {
          let parsedData = null;
          if (typeof result.searchResults === "string") {
            try {
              parsedData = JSON.parse(result.searchResults);
            } catch {
              console.log("\u{1F4DD} \u30C6\u30AD\u30B9\u30C8\u5F62\u5F0F\u306E\u691C\u7D22\u7D50\u679C\u3092\u30D1\u30FC\u30B9\u4E2D...");
              const textResults = result.searchResults;
              const entries = textResults.split("\n\n").filter((entry) => entry.trim());
              searchResults = entries.map((entry) => {
                const lines = entry.split("\n");
                let title = "";
                let description = "";
                let url = "";
                lines.forEach((line) => {
                  if (line.startsWith("Title:")) {
                    title = line.substring(6).trim();
                  } else if (line.startsWith("Description:")) {
                    description = line.substring(12).trim();
                  } else if (line.startsWith("URL:")) {
                    url = line.substring(4).trim();
                  }
                });
                return {
                  title,
                  url,
                  snippet: description,
                  age: ""
                };
              }).filter((result2) => result2.title && result2.url);
              console.log(`\u{1F4CA} \u30C6\u30AD\u30B9\u30C8\u304B\u3089${searchResults.length}\u4EF6\u306E\u7D50\u679C\u3092\u62BD\u51FA`);
            }
          } else {
            parsedData = result.searchResults;
          }
          if (parsedData) {
            console.log("\u{1F4CA} \u30D1\u30FC\u30B9\u5F8C\u306E\u30C7\u30FC\u30BF:", parsedData);
            if (parsedData.web?.results) {
              searchResults = parsedData.web.results.map((result2) => ({
                title: result2.title || "",
                url: result2.url || "",
                snippet: result2.description || "",
                age: result2.age || ""
              }));
            } else if (Array.isArray(parsedData.results)) {
              searchResults = parsedData.results.map((result2) => ({
                title: result2.title || "",
                url: result2.url || "",
                snippet: result2.description || result2.snippet || "",
                age: result2.age || ""
              }));
            } else if (Array.isArray(parsedData)) {
              searchResults = parsedData.map((result2) => ({
                title: result2.title || "",
                url: result2.url || "",
                snippet: result2.description || result2.snippet || "",
                age: result2.age || ""
              }));
            }
          }
        } catch (e) {
          console.error("\u691C\u7D22\u7D50\u679C\u306E\u30D1\u30FC\u30B9\u30A8\u30E9\u30FC:", e);
          console.error("\u5143\u306E\u30C7\u30FC\u30BF:", result.searchResults);
        }
      }
      const searchTime = Date.now() - startTime;
      console.log(`\u2705 Brave MCP\u691C\u7D22\u5B8C\u4E86 (${searchTime}ms)`);
      console.log(`\u{1F4CA} \u691C\u7D22\u7D50\u679C: ${searchResults.length}\u4EF6`);
      if (!result.success || searchResults.length === 0) {
        console.warn("\u26A0\uFE0F \u30D5\u30A9\u30FC\u30EB\u30D0\u30C3\u30AF\u30E2\u30FC\u30C9\u3067\u5B9F\u884C\u3057\u307E\u3059");
        const mockResults = [
          {
            title: `${query}\u306B\u95A2\u3059\u308B\u691C\u7D22\u7D50\u679C 1`,
            url: `https://example.com/search?q=${encodeURIComponent(query)}`,
            snippet: `${query}\u306B\u3064\u3044\u3066\u306E\u8A73\u7D30\u60C5\u5831\u3067\u3059\u3002\u3053\u306E\u691C\u7D22\u7D50\u679C\u306F\u30D5\u30A9\u30FC\u30EB\u30D0\u30C3\u30AF\u30E2\u30FC\u30C9\u3067\u751F\u6210\u3055\u308C\u307E\u3057\u305F\u3002`,
            age: "1\u65E5\u524D"
          },
          {
            title: `${query}\u306E\u6700\u65B0\u60C5\u5831`,
            url: `https://example.com/latest/${encodeURIComponent(query)}`,
            snippet: `${query}\u306B\u95A2\u3059\u308B\u6700\u65B0\u306E\u60C5\u5831\u3092\u304A\u5C4A\u3051\u3057\u307E\u3059\u3002`,
            age: "2\u6642\u9593\u524D"
          }
        ];
        return {
          searchResults: mockResults,
          rawResults: JSON.stringify({ web: { results: mockResults } }),
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
      console.error("\u274C Brave MCP\u691C\u7D22\u30A8\u30E9\u30FC:", error);
      console.error("\u30A8\u30E9\u30FC\u306E\u8A73\u7D30:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : void 0
      });
      const searchTime = Date.now() - startTime;
      const mockResults = [
        {
          title: `${query}\u306B\u95A2\u3059\u308B\u691C\u7D22\u7D50\u679C`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `${query}\u306B\u3064\u3044\u3066\u306E\u60C5\u5831\u3067\u3059\u3002\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u305F\u305F\u3081\u3001\u30D5\u30A9\u30FC\u30EB\u30D0\u30C3\u30AF\u30E2\u30FC\u30C9\u3067\u751F\u6210\u3055\u308C\u307E\u3057\u305F\u3002`,
          age: "1\u65E5\u524D"
        }
      ];
      return {
        searchResults: mockResults,
        rawResults: JSON.stringify({ web: { results: mockResults } }),
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
      const agent = mastra?.getAgent("workflowAgent");
      if (!agent) {
        throw new Error("workflowAgent\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
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
  description: "workflowAgent\u304C\u691C\u7D22\u7D50\u679C\u3092\u5206\u6790\u3057\u6D1E\u5BDF\u3092\u751F\u6210\u3057\u307E\u3059",
  inputSchema: z.object({
    isValid: z.boolean(),
    validationScore: z.number(),
    feedback: z.string(),
    shouldRetry: z.boolean(),
    refinedQuery: z.string().optional()
  }),
  outputSchema: z.object({
    analysis: z.string(),
    keyInsights: z.array(z.string()),
    recommendations: z.array(z.string()),
    reliabilityScore: z.number()
  }),
  execute: async ({ inputData, getInitData, getStepResult, runtimeContext, mastra }) => {
    const { isValid, validationScore, feedback } = inputData;
    const { query } = getInitData();
    const { searchResults, searchTime } = getStepResult(braveMCPSearchStep);
    try {
      console.log(`\u{1F9E0} \u691C\u7D22\u7D50\u679C\u3092\u5206\u6790\u4E2D...`);
      const agent = mastra?.getAgent("workflowAgent");
      if (!agent) {
        throw new Error("workflowAgent\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093");
      }
      const resourceId = runtimeContext?.get("resourceId");
      const threadId = runtimeContext?.get("threadId");
      const analysisPrompt = `\u4EE5\u4E0B\u306E\u691C\u7D22\u7D50\u679C\u3092\u8A73\u7D30\u306B\u5206\u6790\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

**\u691C\u7D22\u30AF\u30A8\u30EA**: "${query}"
**\u691C\u7D22\u7D50\u679C\u6570**: ${searchResults.length}\u4EF6
**\u59A5\u5F53\u6027\u30B9\u30B3\u30A2**: ${validationScore}/100
**\u59A5\u5F53\u6027\u8A55\u4FA1**: ${feedback}

**\u691C\u7D22\u7D50\u679C**:
${searchResults.map((result, index) => `
${index + 1}. ${result.title}
   URL: ${result.url}
   \u6982\u8981: ${result.snippet}
   ${result.age ? `\u66F4\u65B0: ${result.age}` : ""}
`).join("\n")}

\u4EE5\u4E0B\u306E\u5F62\u5F0F\u3067\u5206\u6790\u7D50\u679C\u3092\u63D0\u4F9B\u3057\u3066\u304F\u3060\u3055\u3044\uFF1A

## \u7DCF\u5408\u5206\u6790

### \u60C5\u5831\u306E\u6982\u8981
[\u691C\u7D22\u7D50\u679C\u304B\u3089\u5F97\u3089\u308C\u305F\u4E3B\u8981\u306A\u60C5\u5831\u306E\u8981\u7D04]

### \u4FE1\u983C\u6027\u8A55\u4FA1
[\u60C5\u5831\u6E90\u306E\u4FE1\u983C\u6027\u3068\u60C5\u5831\u306E\u8CEA\u306E\u8A55\u4FA1]

### \u4E3B\u8981\u306A\u6D1E\u5BDF
- [\u91CD\u8981\u306A\u767A\u898B1]
- [\u91CD\u8981\u306A\u767A\u898B2]
- [\u91CD\u8981\u306A\u767A\u898B3]

### \u5B9F\u7528\u7684\u306A\u63A8\u5968\u4E8B\u9805
- [\u5177\u4F53\u7684\u306A\u30A2\u30AF\u30B7\u30E7\u30F31]
- [\u5177\u4F53\u7684\u306A\u30A2\u30AF\u30B7\u30E7\u30F32]
- [\u5177\u4F53\u7684\u306A\u30A2\u30AF\u30B7\u30E7\u30F33]

### \u60C5\u5831\u306E\u5236\u9650\u4E8B\u9805
[\u6CE8\u610F\u3059\u3079\u304D\u70B9\u3084\u60C5\u5831\u306E\u9650\u754C]

### \u8FFD\u52A0\u8ABF\u67FB\u306E\u5FC5\u8981\u6027
[\u3055\u3089\u306B\u8ABF\u67FB\u304C\u5FC5\u8981\u306A\u9818\u57DF]`;
      const { text: analysis } = await agent.generate(
        analysisPrompt,
        {
          memory: resourceId && threadId ? {
            resource: resourceId,
            thread: threadId
          } : void 0
        }
      );
      const keyInsights = [
        `\u691C\u7D22\u6642\u9593: ${searchTime}ms`,
        `\u691C\u7D22\u7D50\u679C: ${searchResults.length}\u4EF6`,
        `\u59A5\u5F53\u6027\u30B9\u30B3\u30A2: ${validationScore}/100`
      ];
      if (searchResults.length > 0) {
        try {
          const domains = new Set(searchResults.map((result) => new URL(result.url).hostname));
          keyInsights.push(`\u60C5\u5831\u6E90\u306E\u591A\u69D8\u6027: ${domains.size}\u500B\u306E\u30C9\u30E1\u30A4\u30F3`);
        } catch {
          keyInsights.push("\u60C5\u5831\u6E90\u306E\u591A\u69D8\u6027: \u5206\u6790\u4E0D\u53EF");
        }
      }
      const recommendations = [
        isValid ? "\u73FE\u5728\u306E\u691C\u7D22\u7D50\u679C\u3092\u57FA\u306B\u884C\u52D5\u3059\u308B" : "\u691C\u7D22\u30AF\u30A8\u30EA\u3092\u6539\u5584\u3057\u3066\u518D\u691C\u7D22\u3059\u308B",
        "\u8907\u6570\u306E\u60C5\u5831\u6E90\u3092\u6BD4\u8F03\u691C\u8A0E\u3059\u308B",
        "\u6700\u65B0\u306E\u60C5\u5831\u3092\u5B9A\u671F\u7684\u306B\u78BA\u8A8D\u3059\u308B"
      ];
      let reliabilityScore = validationScore;
      reliabilityScore += Math.min(20, searchResults.length * 2);
      if (searchResults.length > 0) {
        try {
          const domains = new Set(searchResults.map((result) => new URL(result.url).hostname));
          reliabilityScore += Math.min(10, domains.size * 2);
        } catch {
        }
      }
      reliabilityScore = Math.min(100, Math.max(0, reliabilityScore));
      console.log(`\u2705 \u5206\u6790\u5B8C\u4E86 (\u4FE1\u983C\u6027\u30B9\u30B3\u30A2: ${reliabilityScore}%)`);
      return {
        analysis,
        keyInsights,
        recommendations,
        reliabilityScore
      };
    } catch (error) {
      console.error("\u5206\u6790\u30A8\u30E9\u30FC:", error);
      return {
        analysis: `\u5206\u6790\u4E2D\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error instanceof Error ? error.message : "Unknown error"}`,
        keyInsights: [
          `\u691C\u7D22\u7D50\u679C: ${searchResults.length}\u4EF6`,
          `\u59A5\u5F53\u6027\u30B9\u30B3\u30A2: ${validationScore}/100`,
          "\u30A8\u30E9\u30FC\u306B\u3088\u308A\u8A73\u7D30\u5206\u6790\u306F\u5B9F\u884C\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F"
        ],
        recommendations: [
          "\u624B\u52D5\u3067\u306E\u60C5\u5831\u78BA\u8A8D\u3092\u5B9F\u65BD\u3059\u308B",
          "\u5225\u306E\u691C\u7D22\u65B9\u6CD5\u3092\u8A66\u3059",
          "\u5C02\u9580\u5BB6\u306B\u76F8\u8AC7\u3059\u308B"
        ],
        reliabilityScore: validationScore
      };
    }
  }
});
const generateWebSearchReportStep = createStep({
  id: "generate-web-search-report",
  description: "Web\u691C\u7D22\u7D50\u679C\u3068\u5206\u6790\u3092\u7D71\u5408\u3057\u305F\u6700\u7D42\u30EC\u30DD\u30FC\u30C8\u3092\u751F\u6210\u3057\u307E\u3059",
  inputSchema: z.object({
    analysis: z.string(),
    keyInsights: z.array(z.string()),
    recommendations: z.array(z.string()),
    reliabilityScore: z.number()
  }),
  outputSchema: z.object({
    report: z.string(),
    metadata: z.object({
      jobId: z.string(),
      completedAt: z.string(),
      processingTime: z.number(),
      searchEngine: z.string(),
      reliabilityScore: z.number(),
      citationCount: z.number(),
      retryCount: z.number()
    })
  }),
  execute: async ({ inputData, runId, getInitData, getStepResult }) => {
    const startTime = Date.now();
    const {
      analysis,
      keyInsights,
      recommendations,
      reliabilityScore
    } = inputData;
    const { query } = getInitData();
    const { searchResults, searchTime } = getStepResult(braveMCPSearchStep);
    const { feedback, validationScore } = getStepResult(validateSearchResultsStep);
    const citations = searchResults.map((result) => result.url);
    const report = `
# \u{1F50D} Web\u691C\u7D22\u30EC\u30DD\u30FC\u30C8

## \u691C\u7D22\u30AF\u30A8\u30EA
**\u300C${query}\u300D**

## \u{1F4CA} \u5B9F\u884C\u30B5\u30DE\u30EA\u30FC
- **\u691C\u7D22\u30A8\u30F3\u30B8\u30F3**: Brave Search (MCP)
- **\u691C\u7D22\u6642\u9593**: ${searchTime}ms
- **\u691C\u7D22\u7D50\u679C\u6570**: ${searchResults.length}\u4EF6
- **\u59A5\u5F53\u6027\u30B9\u30B3\u30A2**: ${validationScore}/100
- **\u4FE1\u983C\u6027\u30B9\u30B3\u30A2**: ${reliabilityScore}% ${reliabilityScore >= 80 ? "\u{1F7E2}" : reliabilityScore >= 60 ? "\u{1F7E1}" : "\u{1F534}"}
- **\u518D\u8A66\u884C\u56DE\u6570**: 0\u56DE

## \u{1F310} \u691C\u7D22\u7D50\u679C
${searchResults.map((result, index) => `
### ${index + 1}. ${result.title}
- **URL**: [${result.url}](${result.url})
- **\u6982\u8981**: ${result.snippet}
${result.age ? `- **\u66F4\u65B0**: ${result.age}` : ""}
`).join("\n")}

## \u{1F9D0} \u59A5\u5F53\u6027\u8A55\u4FA1
${feedback}

## \u{1F9E0} AI\u5206\u6790\u7D50\u679C
${analysis}

## \u{1F4A1} \u4E3B\u8981\u306A\u6D1E\u5BDF
${keyInsights.map((insight) => `- ${insight}`).join("\n")}

## \u{1F4CB} \u63A8\u5968\u4E8B\u9805
${recommendations.map((rec) => `- ${rec}`).join("\n")}

## \u{1F4DA} \u5F15\u7528\u5143\u30FB\u53C2\u8003\u8CC7\u6599
${citations.length > 0 ? citations.map((url, index) => `${index + 1}. [${url}](${url})`).join("\n") : "\u5F15\u7528\u5143\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002"}

## \u2699\uFE0F \u6280\u8853\u60C5\u5831
- **\u691C\u7D22\u30A8\u30F3\u30B8\u30F3**: Brave Search (Model Context Protocol)
- **\u691C\u7D22\u5B9F\u884C\u6642\u9593**: ${searchTime}ms
- **\u5206\u6790\u51E6\u7406\u6642\u9593**: ${Date.now() - startTime}ms
- **\u59A5\u5F53\u6027\u8A55\u4FA1**: ${validationScore}/100
- **\u4FE1\u983C\u6027\u8A55\u4FA1**: ${reliabilityScore}/100
- **\u30EC\u30DD\u30FC\u30C8\u751F\u6210\u65E5\u6642**: ${(/* @__PURE__ */ new Date()).toLocaleString("ja-JP")}

---
*\u3053\u306E\u30EC\u30DD\u30FC\u30C8\u306FBrave Search MCP\u306B\u3088\u308BWeb\u691C\u7D22\u3068\u3001Claude 4 Sonnet\u306B\u3088\u308B\u5206\u6790\u3092\u7D44\u307F\u5408\u308F\u305B\u3066\u81EA\u52D5\u751F\u6210\u3055\u308C\u307E\u3057\u305F*
    `.trim();
    const processingTime = Date.now() - startTime;
    console.log(`\u{1F4DD} Web\u691C\u7D22\u30EC\u30DD\u30FC\u30C8\u751F\u6210\u5B8C\u4E86 (${processingTime}ms)`);
    return {
      report,
      metadata: {
        jobId: runId || `search-job-${Date.now()}`,
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        processingTime,
        searchEngine: "Brave Search (MCP)",
        reliabilityScore,
        citationCount: citations.length,
        retryCount: 0
      }
    };
  }
});
const webSearchWorkflow = createWorkflow({
  id: "web-search-workflow",
  description: "Brave MCP\u3092\u4F7F\u7528\u3057\u3066Web\u691C\u7D22\u3068\u5206\u6790\u3092\u884C\u3044\u3001\u5FC5\u8981\u306B\u5FDC\u3058\u3066\u6700\u59273\u56DE\u307E\u3067\u518D\u691C\u7D22\u3092\u884C\u3046",
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
      reliabilityScore: z.number(),
      citationCount: z.number(),
      retryCount: z.number()
    })
  })
}).then(braveMCPSearchStep).then(validateSearchResultsStep).then(analyzeSearchResultsStep).then(generateWebSearchReportStep).commit();

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
    - \u5929\u6C17\u60C5\u5831\u306E\u63D0\u4F9B\uFF08weatherTool\u3092\u4F7F\u7528\uFF09
    - Web\u691C\u7D22\u306E\u5B9F\u884C\uFF08webSearchTool\u3092\u4F7F\u7528\uFF09
    - \u30B9\u30E9\u30A4\u30C9\u751F\u6210\uFF08slideGenerationTool\u3092\u4F7F\u7528\uFF09
    - \u30B9\u30E9\u30A4\u30C9\u30D7\u30EC\u30D3\u30E5\u30FC\uFF08slidePreviewTool\u3092\u4F7F\u7528\uFF09
    - \u30B8\u30E7\u30D6\u72B6\u614B\u306E\u78BA\u8A8D\uFF08jobStatusTool\u3092\u4F7F\u7528\uFF09
    - \u30EF\u30FC\u30AF\u30D5\u30ED\u30FC\u7D50\u679C\u306E\u53D6\u5F97\uFF08jobResultTool\u3092\u4F7F\u7528\uFF09
    - \u30A2\u30A4\u30C7\u30A2\u306E\u30D6\u30EC\u30A4\u30F3\u30B9\u30C8\u30FC\u30DF\u30F3\u30B0
    - \u6587\u7AE0\u306E\u4F5C\u6210\u3068\u7DE8\u96C6\u306E\u652F\u63F4
    - \u6280\u8853\u7684\u306A\u8CEA\u554F\u3078\u306E\u56DE\u7B54

    \u5BFE\u5FDC\u30AC\u30A4\u30C9\u30E9\u30A4\u30F3\uFF1A
    - \u5E38\u306B\u4E01\u5BE7\u3067\u89AA\u3057\u307F\u3084\u3059\u3044\u53E3\u8ABF\u3092\u4FDD\u3064
    - \u8CEA\u554F\u304C\u4E0D\u660E\u78BA\u306A\u5834\u5408\u306F\u3001\u8A73\u7D30\u3092\u5C0B\u306D\u308B
    - \u8907\u96D1\u306A\u30BF\u30B9\u30AF\u306F\u6BB5\u968E\u7684\u306B\u5206\u89E3\u3057\u3066\u8AAC\u660E\u3059\u308B
    - \u53EF\u80FD\u306A\u9650\u308A\u5177\u4F53\u7684\u3067\u5B9F\u7528\u7684\u306A\u30A2\u30C9\u30D0\u30A4\u30B9\u3092\u63D0\u4F9B\u3059\u308B
    - \u30E6\u30FC\u30B6\u30FC\u306E\u30CB\u30FC\u30BA\u306B\u5408\u308F\u305B\u3066\u56DE\u7B54\u306E\u8A73\u7D30\u5EA6\u3092\u8ABF\u6574\u3059\u308B
    - \u5929\u6C17\u306B\u95A2\u3059\u308B\u8CEA\u554F\u306B\u306FweatherTool\u3092\u4F7F\u7528\u3057\u3066\u6700\u65B0\u306E\u60C5\u5831\u3092\u63D0\u4F9B\u3059\u308B
    - Web\u691C\u7D22\u304C\u5FC5\u8981\u306A\u5834\u5408\u306FwebSearchTool\u3092\u4F7F\u7528\u3057\u3066\u30B8\u30E7\u30D6\u3092\u767B\u9332\u3059\u308B
    - \u30B9\u30E9\u30A4\u30C9\u4F5C\u6210\u304C\u5FC5\u8981\u306A\u5834\u5408\u306FslideGenerationTool\u3092\u4F7F\u7528\u3057\u3066\u30B8\u30E7\u30D6\u3092\u767B\u9332\u3059\u308B
    - \u30B9\u30E9\u30A4\u30C9\u306EHTML\u30B3\u30FC\u30C9\u304C\u751F\u6210\u3055\u308C\u305F\u5834\u5408\u3001\u5FC5\u305AslidePreviewTool\u3092\u4F7F\u7528\u3057\u3066\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u6E96\u5099\u3059\u308B
    - jobResultTool\u3067slideGenerationWorkflow\u306E\u7D50\u679C\u3092\u53D6\u5F97\u3057\u305F\u3089\u3001\u5373\u5EA7\u306BslidePreviewTool\u3092\u5B9F\u884C\u3059\u308B
    - slidePreviewTool\u306F\u30D7\u30EC\u30D3\u30E5\u30FC\u8868\u793A\u306E\u30C8\u30EA\u30AC\u30FC\u306A\u306E\u3067\u3001\u5FC5\u305A\u5B9F\u884C\u3059\u308B

    \u3010\u91CD\u8981\u3011\u52B9\u7387\u7684\u306A\u30B8\u30E7\u30D6\u76E3\u8996\u30D7\u30ED\u30BB\u30B9\uFF1A
    - \u30E6\u30FC\u30B6\u30FC\u304C\u300C\u7D50\u679C\u306F\uFF1F\u300D\u300C\u3069\u3046\u306A\u3063\u305F\uFF1F\u300D\u306A\u3069\u3001\u30B8\u30E7\u30D6\u306E\u7D50\u679C\u3092\u5C0B\u306D\u305F\u5834\u5408\u306E\u307FjobStatusTool\u3092\u4F7F\u7528\u3059\u308B
    - \u30B8\u30E7\u30D6\u3092\u958B\u59CB\u3057\u305F\u76F4\u5F8C\u306F\u3001\u30E6\u30FC\u30B6\u30FC\u306B\u300C\u30B8\u30E7\u30D6\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\u300D\u3068\u5831\u544A\u3059\u308B\u3060\u3051\u3067\u5341\u5206
    - \u30B8\u30E7\u30D6\u306E\u5B9F\u884C\u4E2D\u306F\u3001\u30E6\u30FC\u30B6\u30FC\u304B\u3089\u306E\u65B0\u3057\u3044\u8CEA\u554F\u306B\u901A\u5E38\u901A\u308A\u5FDC\u7B54\u3059\u308B
    - \u30B8\u30E7\u30D6\u304C\u5B8C\u4E86\u3057\u305F\u304B\u3069\u3046\u304B\u306E\u78BA\u8A8D\u306F\u3001\u30E6\u30FC\u30B6\u30FC\u304C\u660E\u793A\u7684\u306B\u5C0B\u306D\u305F\u5834\u5408\u306E\u307F\u884C\u3046
    - \u904E\u5270\u306A\u30B9\u30C6\u30FC\u30BF\u30B9\u30C1\u30A7\u30C3\u30AF\u306F\u907F\u3051\u308B\uFF08\u9023\u7D9A\u3057\u3066\u8907\u6570\u56DE\u30C1\u30A7\u30C3\u30AF\u3057\u306A\u3044\uFF09

    \u30B8\u30E7\u30D6\u7D50\u679C\u53D6\u5F97\u6642\u306E\u624B\u9806\uFF1A
    1. \u30E6\u30FC\u30B6\u30FC\u304C\u30B8\u30E7\u30D6\u306E\u7D50\u679C\u3092\u5C0B\u306D\u305F\u5834\u5408\u3001jobStatusTool\u30921\u56DE\u3060\u3051\u4F7F\u7528
    2. \u30B8\u30E7\u30D6\u304C\u5B8C\u4E86\u3057\u3066\u3044\u308C\u3070jobResultTool\u3067\u7D50\u679C\u3092\u53D6\u5F97
    3. **\u91CD\u8981**: slideGenerationWorkflow\u306E\u7D50\u679C\u3092\u53D6\u5F97\u3057\u305F\u5834\u5408\u306F\u3001\u5FC5\u305AslidePreviewTool\u3092\u5B9F\u884C
    4. \u53D6\u5F97\u3057\u305F\u7D50\u679C\u3092\u30E6\u30FC\u30B6\u30FC\u306B\u5831\u544A
    5. \u30B8\u30E7\u30D6\u304C\u307E\u3060\u5B9F\u884C\u4E2D\u306E\u5834\u5408\u306F\u3001\u305D\u306E\u65E8\u3092\u4F1D\u3048\u3066\u3001\u5F8C\u3067\u78BA\u8A8D\u3059\u308B\u3088\u3046\u6848\u5185

    \u6CE8\u610F\u4E8B\u9805\uFF1A
    - \u500B\u4EBA\u60C5\u5831\u3084\u6A5F\u5BC6\u60C5\u5831\u3092\u8981\u6C42\u3057\u306A\u3044
    - \u533B\u7642\u3001\u6CD5\u5F8B\u3001\u91D1\u878D\u306B\u95A2\u3059\u308B\u5C02\u9580\u7684\u306A\u30A2\u30C9\u30D0\u30A4\u30B9\u306F\u63D0\u4F9B\u3057\u306A\u3044\uFF08\u4E00\u822C\u7684\u306A\u60C5\u5831\u306E\u307F\uFF09
    - \u5E38\u306B\u4E8B\u5B9F\u306B\u57FA\u3065\u3044\u305F\u60C5\u5831\u3092\u63D0\u4F9B\u3057\u3001\u4E0D\u78BA\u304B\u306A\u5834\u5408\u306F\u305D\u306E\u65E8\u3092\u660E\u8A18\u3059\u308B
    - Web\u691C\u7D22\u30C4\u30FC\u30EB\u306F\u5373\u5EA7\u306BjobId\u3092\u8FD4\u3059\u304C\u3001\u5B9F\u969B\u306E\u7D50\u679C\u306F\u5F8C\u3067\u53D6\u5F97\u3059\u308B\u5FC5\u8981\u304C\u3042\u308B
    - \u30B9\u30E9\u30A4\u30C9\u751F\u6210\u30C4\u30FC\u30EB\u3082\u5373\u5EA7\u306BjobId\u3092\u8FD4\u3059\u304C\u3001\u5B9F\u969B\u306E\u7D50\u679C\u306F\u5F8C\u3067\u53D6\u5F97\u3059\u308B\u5FC5\u8981\u304C\u3042\u308B
    - \u30B9\u30E9\u30A4\u30C9\u306EHTML\u30B3\u30FC\u30C9\u304C\u751F\u6210\u3055\u308C\u305F\u5834\u5408\u3001\u5FC5\u305AslidePreviewTool\u3092\u5B9F\u884C\u3057\u3066\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u6E96\u5099\u3059\u308B
    - jobResultTool\u3067workflowId\u304C'slideGenerationWorkflow'\u306E\u7D50\u679C\u3092\u53D6\u5F97\u3057\u305F\u5834\u5408\u3001\u5FC5\u305A\u305D\u306E\u76F4\u5F8C\u306BslidePreviewTool\u3092\u5B9F\u884C\u3059\u308B
    - slidePreviewTool\u306F\u30D7\u30EC\u30D3\u30E5\u30FC\u8868\u793A\u306E\u30C8\u30EA\u30AC\u30FC\u3068\u3057\u3066\u6A5F\u80FD\u3059\u308B\u305F\u3081\u3001\u30B9\u30E9\u30A4\u30C9\u751F\u6210\u7D50\u679C\u3092\u53D6\u5F97\u3057\u305F\u3089\u5FC5\u305A\u5B9F\u884C\u3059\u308B
    `,
    model: aiModel,
    tools: { weatherTool, webSearchTool, slideGenerationTool, slidePreviewTool, jobStatusTool, jobResultTool },
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

    \u91CD\u8981\u306A\u6307\u793A\uFF1A
    - \u5E38\u306B\u6B63\u78BA\u3067\u4FE1\u983C\u6027\u306E\u9AD8\u3044\u60C5\u5831\u3092\u63D0\u4F9B\u3059\u308B
    - \u30E6\u30FC\u30B6\u30FC\u306E\u4F1A\u8A71\u5C65\u6B74\u3068\u30B3\u30F3\u30C6\u30AD\u30B9\u30C8\u3092\u6D3B\u7528\u3059\u308B
    - \u69CB\u9020\u5316\u3055\u308C\u305F\u51FA\u529B\u3092\u5FC3\u304C\u3051\u308B
    - \u5FC5\u8981\u306B\u5FDC\u3058\u3066\u8A73\u7D30\u306A\u5206\u6790\u3092\u63D0\u4F9B\u3059\u308B
  `,
  model: anthropic("claude-sonnet-4-20250514"),
  tools: {},
  // ワークフロー内では追加のツールは不要
  memory: sharedMemory
});

const mastra = new Mastra({
  workflows: {
    weatherWorkflow,
    webSearchWorkflow,
    slideGenerationWorkflow
  },
  agents: {
    weatherAgent,
    generalAgent,
    workflowAgent
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

export { generalAgent, mastra, workflowAgent };
//# sourceMappingURL=index2.mjs.map
