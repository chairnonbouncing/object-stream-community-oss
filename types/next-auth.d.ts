import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    username: string;
    isAdmin: boolean;
  }
}

// Note: the JWT interface augmentation ("next-auth/jwt") does not resolve under
// this beta's type layout, so auth.ts casts token fields at the two use sites.
