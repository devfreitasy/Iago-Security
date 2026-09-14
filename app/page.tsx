import IagoSecurityApp from "./IagoSecurityApp";
import { chatGPTSignOutPath, getChatGPTUser, requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const authenticatedUser = await getChatGPTUser();
  const user = authenticatedUser ?? (process.env.NODE_ENV === "development"
    ? {
        userId: "local-quality-assurance",
        displayName: "Iago Freitas",
        email: "iago@iago-security.local",
        fullName: "Iago Freitas",
      }
    : await requireChatGPTUser("/"));
  return <IagoSecurityApp user={user} signOutPath={chatGPTSignOutPath("/")} />;
}
