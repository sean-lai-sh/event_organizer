import { httpRouter } from "convex/server";
import { createClient } from "@convex-dev/better-auth";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { createAuth } from "./auth";

const authComponent = createClient<DataModel>(components.betterAuth);

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

export default http;
