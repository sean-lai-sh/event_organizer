import { betterAuth } from "better-auth";
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { GenericCtx } from "@convex-dev/better-auth/utils";
import authConfig from "./auth.config";

const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.BETTER_AUTH_URL!,
    secret: process.env.BETTER_AUTH_SECRET!,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [convex({ authConfig })],
  });

export const { getAuthUser, safeGetAuthUser, clientApi } = authComponent;
export const { getAuthUser: getAuthUserQuery } = authComponent.clientApi();
