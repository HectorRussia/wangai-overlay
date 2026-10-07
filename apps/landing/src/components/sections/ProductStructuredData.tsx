import { site } from "@/config/site";
import { siteOrigin } from "@/config/seo";
import { faqs } from "@/content/home";

export function ProductStructuredData() {
  const productId = `${siteOrigin}/#software`;
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${siteOrigin}/#website`, name: site.name, alternateName: "ว่าไง", url: siteOrigin, inLanguage: "th", description: site.description, about: { "@id": productId } },
      { "@type": "SoftwareApplication", "@id": productId, name: site.name, alternateName: "ว่าไง", url: siteOrigin, description: faqs[0].answer, applicationCategory: "UtilitiesApplication", operatingSystem: "Windows 10, Windows 11 (x64)", inLanguage: ["th", "en"], downloadUrl: `${siteOrigin}${site.download}`, image: `${siteOrigin}/images/wangai-icon.png`, featureList: ["แปลเสียงอังกฤษจากแอปที่เลือกเป็นข้อความไทยบนจอ", "แปลเสียงไทยเป็นข้อความอังกฤษสำหรับอ่านแล้วพูดตอบหรือคัดลอก", "เลือกแหล่งเสียงจากเกม Discord หรือเบราว์เซอร์ได้ครั้งละหนึ่งแอป"] },
      { "@type": "FAQPage", "@id": `${siteOrigin}/#faq`, mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })) },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
