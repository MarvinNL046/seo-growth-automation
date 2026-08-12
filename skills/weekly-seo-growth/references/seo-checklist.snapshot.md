# On-page SEO — 80+ Point Checklist (immutable snapshot)

Snapshot date: 2026-08-12. Source and SHA-256 are recorded in `seo-checklist.provenance.json`.

This snapshot contains 99 raw checks in 15 categories. It is not a weighted 80/100 score. Pass only when every applicable check is satisfied; mark non-applicable checks individually with a reason.

## 1. Head & metadata

- [ ] **Title tag** — 50–60 characters; primary keyword near the start.
- [ ] **Meta description** — 150–160 characters; keyword, benefit, and soft CTA.
- [ ] **Canonical URL** set to prevent duplicates.
- [ ] **Open Graph** — `og:title`, `og:description`, `og:image` (1200×630), `og:url`, and `og:type`.
- [ ] **Twitter Card** — `summary_large_image`, title, description, and image.
- [ ] **Language attribute** on `<html>`.
- [ ] **Viewport meta** tag for responsive rendering.
- [ ] **Favicon** and `apple-touch-icon`.
- [ ] **Charset meta** — UTF-8.

## 2. URL structure

- [ ] **Short slug** — under 60 characters.
- [ ] **Primary keyword** in the slug.
- [ ] **Hyphens only** — never underscores.
- [ ] **Lowercase** only.
- [ ] **No stop words** unless necessary.
- [ ] **Logical hierarchy**.

## 3. Headings

- [ ] **Exactly one H1** per page containing the primary keyword.
- [ ] **Logical H2 → H3 hierarchy** without skipped levels.
- [ ] **H2s use supporting keywords and questions** from the cluster.
- [ ] **No keyword stuffing**; write naturally.

## 4. Copy & body

- [ ] **Primary keyword** appears in the first 100 words.
- [ ] **Direct answer** to the query appears in the first paragraph.
- [ ] **Length** matches the SERP average within 20% of the top-three average.
- [ ] **Short paragraphs** of one to four sentences.
- [ ] **Readability** at approximately 8th–10th grade level.
- [ ] **Active voice** preferred.
- [ ] **Bold key phrases** sparingly.
- [ ] **Bullets and numbered lists** where appropriate.

## 5. FAQ section

- [ ] **Four to eight questions** from real question research and People Also Ask.
- [ ] **Direct answers** of two to four sentences each, researched and cited where factual.
- [ ] **FAQ schema** applied when the visible FAQ and current eligibility rules support it.

## 6. Images

- [ ] **Alt text** describes the image and includes a keyword only where natural.
- [ ] **Filenames** are descriptive and hyphenated.
- [ ] **WebP**, compressed below 200 KB.
- [ ] **Width and height attributes** specified to prevent CLS.
- [ ] **Lazy loading** for below-fold images.
- [ ] **Responsive `srcset`** where needed.
- [ ] **Featured/hero image** for social sharing.

## 7. Internal links

- [ ] **Three to five internal links** per post, with more where a pillar warrants it.
- [ ] Link to **related posts and relevant service/category/tool pages**.
- [ ] **Descriptive anchor text**; never generic “click here” or “read more”.
- [ ] Links are **contextually placed** in body copy.
- [ ] **Breadcrumbs** on every applicable page.

## 8. External links

- [ ] **Two to three external links** to authoritative sources.
- [ ] Sources are **relevant** to the topic.
- [ ] External links open in a **new tab** with `rel="noopener"` when that is the site's policy.
- [ ] Use `nofollow` for sponsored links and `sponsored nofollow` for affiliate links.

## 9. Schema markup (JSON-LD)

- [ ] **Article** schema on blog posts.
- [ ] **LocalBusiness** schema using the most specific subtype for applicable service businesses.
- [ ] **Service** schema on applicable service pages.
- [ ] **FAQPage** schema wherever an eligible visible FAQ exists.
- [ ] **BreadcrumbList** schema on every applicable page.
- [ ] **Organization** schema site-wide.
- [ ] **Author/Person** schema for real bylines.
- [ ] **HowTo** schema for eligible step-by-step instructional content.
- [ ] **ItemList with nested Review** for genuine roundup posts.
- [ ] **Product with Review** for genuine individual reviews.

## 10. E-E-A-T signals

- [ ] **Author byline** with a real name on every blog post.
- [ ] **Author bio** with verifiable credentials.
- [ ] Link to the **author's dedicated page**.
- [ ] **Published date** displayed.
- [ ] **Last updated date** displayed only after a genuine refresh.
- [ ] **Real stories, numbers, and opinions** from approved brand sources.
- [ ] **Authoritative sources** cited in the body.
- [ ] **About page** with truthful company credentials.
- [ ] **Contact page** with truthful available contact details; never invent an address or phone number.
- [ ] **First-person experience** anchored in the opening only when genuine experience exists.

## 11. Accessibility

- [ ] **Semantic HTML5** — header, nav, main, article, and footer where applicable.
- [ ] **ARIA labels** on interactive elements where needed.
- [ ] **Color contrast** meets WCAG AA (4.5:1 for body text).
- [ ] **Focus indicators** are visible on interactive elements.
- [ ] **Alt text on all images**, with empty alt text for decorative images.
- [ ] **Descriptive link text**.
- [ ] **Skip-to-content link** for keyboard users.

## 12. Mobile & responsive

- [ ] **Responsive layout**.
- [ ] **Touch targets** are at least 48×48 pixels.
- [ ] **Body font** is at least 16 pixels.
- [ ] **No horizontal scroll** at any tested viewport.
- [ ] **No intrusive interstitials**.

## 13. Social preview

- [ ] **Open Graph image** is 1200×630 and below 1 MB.
- [ ] **Twitter Card image** is 1200×600 where a separate image is used.
- [ ] **Compelling `og:description`**, distinct from the meta description only when valuable.
- [ ] **Pinterest pin image** (1000×1500) for applicable visual niches.

## 14. Conversion elements

For service/lead-generation pages:

- [ ] **Primary CTA** above the fold.
- [ ] **Phone number** with click-to-call where a real business phone number exists.
- [ ] **Multiple CTA placements** throughout the page.
- [ ] **Trust signals** such as truthful reviews, ratings, licences, or years.
- [ ] **Testimonials** with real names and photos where permission exists.
- [ ] **Service-area coverage** listed truthfully.
- [ ] **Business hours** displayed.
- [ ] **Physical address** with map where a real public location exists.

For affiliate/content sites, use this branch instead:

- [ ] **Primary CTA** is an appropriate newsletter or primary product action.
- [ ] **Affiliate disclosure** appears above the fold when affiliate links exist.
- [ ] **Channel follow** action replaces the phone CTA where applicable.
- [ ] **Language/region indicator** replaces service-area information where applicable.

## 15. Long-form content (at least 1,500 words)

- [ ] **Table of contents** with anchor links at the top.
- [ ] **Jump links** for each H2.
- [ ] **Back-to-top button**.
- [ ] **Reading-progress bar** where appropriate.
- [ ] **Estimated reading time** displayed.

## Workflow gates carried with the snapshot

Research the SERP and PAA before drafting. Match top-three format and content length, cover shared topics plus one or two evidence-backed gaps, write a direct answer, and check the keyword register before assigning a URL.

After implementation, require a production build, rendered HTML containing content/meta/schema, sitemap and canonical verification, a 375 px no-overflow check, touch targets of at least 48×48, and mobile Lighthouse of at least 90 when the environment permits a valid measurement. Use Core Web Vitals targets of LCP below 2.5 seconds, INP below 200 ms, and CLS below 0.1 as technical gates when measurable.
