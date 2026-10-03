import { site } from "@/config/site";
import { siteOrigin } from "@/config/seo";
import { faqs } from "@/content/home";

export const dynamic = "force-static";

export function GET() {
  const content = `# WANGAI (ว่าไง)

> ${site.description}

${faqs[0].answer}

WANGAI is a Windows application that translates audio from a selected game or application into on-screen text. English audio becomes Thai text; Thai microphone audio becomes English text that the user can read aloud or copy. The website contains simulated demonstrations, not a live translation service. Demo speed is not a real-world latency guarantee.

## Product information
- [Overview and FAQ](${siteOrigin}/index.md): Current features, supported systems, languages, and limitations in Markdown.
- [Landing page](${siteOrigin}/): Product demonstrations and download links.
- [Windows downloads](${site.releases}): Published builds on GitHub Releases.

## Policies
- [Privacy policy](${siteOrigin}/privacy): Audio processing, service providers, data retention, and pending contact information.
- [Terms of use](${siteOrigin}/terms): Translation limitations, game rules, and account risk. Game publisher approval and ban-free use are not guaranteed.
`;
  return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
