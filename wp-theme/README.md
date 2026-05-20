# Common Ladder WordPress Theme

A civic homelessness resource platform theme for [commonladder.org](https://commonladder.org).

**Version:** 1.0.0  
**Requires WordPress:** 6.0+  
**Requires PHP:** 8.0+  
**License:** GPL v2 or later

---

## Brand Identity

| Token | Color | Hex |
|---|---|---|
| Ladder Blue (Primary) | ![#1C3D6E](https://via.placeholder.com/12/1C3D6E/1C3D6E.png) | `#1C3D6E` |
| Rung Amber (CTA) | ![#E8911A](https://via.placeholder.com/12/E8911A/E8911A.png) | `#E8911A` |
| Resource Sage (Accent) | ![#4A9E82](https://via.placeholder.com/12/4A9E82/4A9E82.png) | `#4A9E82` |
| Commons White (Background) | ![#F8F7F4](https://via.placeholder.com/12/F8F7F4/F8F7F4.png) | `#F8F7F4` |
| Ground Dark (Text) | ![#1A1A2E](https://via.placeholder.com/12/1A1A2E/1A1A2E.png) | `#1A1A2E` |

**Display font:** Manrope 600 (Google Fonts)  
**Body font:** Inter 400/500 (Google Fonts)  
**Tagline:** "Every rung, together."

---

## Theme File Structure

```
wp-theme/
├── style.css              # Theme header + all CSS
├── functions.php          # Theme setup, enqueue, menus, widgets
├── index.php              # Main fallback template
├── header.php             # HTML head + sticky nav
├── footer.php             # Site footer + wp_footer()
├── front-page.php         # Homepage (hero, cards, how-it-works, CTA)
├── page.php               # Generic page template
├── single.php             # Blog post with breadcrumb, author bio, related posts
├── archive.php            # Category/tag/date archive listing
├── 404.php                # Friendly 404 with search + crisis callout
├── screenshot.png         # Theme preview (1200x900, create manually)
├── assets/
│   └── js/
│       └── main.js        # Vanilla JS: mobile menu, validation, smooth scroll
└── README.md              # This file
```

---

## Installation — WordPress Admin

1. Zip the `wp-theme/` folder and rename the zip to `common-ladder.zip`
2. In WordPress admin: **Appearance > Themes > Add New > Upload Theme**
3. Upload `common-ladder.zip` and click **Install Now**
4. Click **Activate**

---

## Installation — GitHub Desktop + Local

### Prerequisites
- [Local by Flywheel](https://localwp.com/) (free local WordPress)
- [GitHub Desktop](https://desktop.github.com/)

### Steps

1. **Create a local WordPress site** in Local:
   - Open Local → click `+` → name it `commonladder`
   - Choose WordPress version 6.x, PHP 8.x
   - Click **Create Site**

2. **Clone the repository** in GitHub Desktop:
   - File → Clone Repository
   - Choose the `commonladder-theme` repo
   - Set the local path to anywhere on your computer

3. **Link the theme** to your local WordPress:
   - Open Local, right-click your site → **Open Site Shell**
   - Run:
     ```bash
     ln -s /path/to/your/clone/wp-theme /app/public/wp-content/themes/common-ladder
     ```
   - Replace `/path/to/your/clone/` with your actual clone path

4. **Activate in WordPress:**
   - Open Local → click **WP Admin**
   - Go to **Appearance > Themes**
   - Activate **Common Ladder**

5. **Set up menus:**
   - Go to **Appearance > Menus**
   - Create a menu and assign it to **Primary Navigation**
   - Add pages: Resources, Organizations, For Nonprofits, About

6. **Set homepage:**
   - Go to **Settings > Reading**
   - Set "Your homepage displays" to **A static page**
   - Set Homepage to your front page (or leave on "Latest posts" to use `index.php`)

---

## Theme Customization

Navigate to **Appearance > Customize** to:

- Change the **hero eyebrow text** ("Free. Trusted. Always here.")
- Change the **hero title**
- Toggle tagline display
- Set a **custom logo** (SVG inline logo is always shown as fallback)

---

## Registering Navigation Menus

The theme registers three menu locations:

| Location slug | Where it appears |
|---|---|
| `primary` | Desktop header navigation |
| `footer-1` | Footer "Resources" column |
| `footer-2` | Footer "Organization" column |

---

## Widget Areas

| ID | Location |
|---|---|
| `sidebar-main` | Main content sidebar |
| `footer-widget-1` | Footer widget column 1 |
| `footer-widget-2` | Footer widget column 2 |

---

## Custom Image Sizes

| Name | Dimensions | Use |
|---|---|---|
| `cl-card` | 600×400 (cropped) | Post cards, archive listings |
| `cl-hero` | 1600×800 (cropped) | Featured images, hero banners |
| `cl-avatar` | 128×128 (cropped) | Author bios |

---

## Accessibility

- Skip-to-content link (visible on focus)
- ARIA labels on all navigation regions
- `aria-current="page"` on active nav links
- `aria-expanded` on mobile menu toggle
- `aria-hidden` on decorative elements
- Semantic heading hierarchy (h1 per page)
- Focus-visible outlines in brand amber
- Color contrast ratios meet WCAG AA

---

## SEO

- `<title>` managed by WordPress (`title-tag` support)
- Meta description hook in `wp_head` (priority 1)
- Open Graph tags (og:title, og:url, og:type, og:image)
- Schema.org markup: `WebPage`, `Article`, `Person`
- Proper heading hierarchy per template
- `hreflang` managed by WordPress core

---

## Deploying to Production (commonladder.org)

1. Ensure your hosting runs PHP 8.0+ and WordPress 6.0+
2. Upload the theme via **Appearance > Themes > Upload** OR
3. FTP/SFTP the `wp-theme/` folder to `/wp-content/themes/common-ladder/`
4. Activate in **Appearance > Themes**
5. Add a CDN (Cloudflare) for asset performance
6. Install a caching plugin (WP Rocket, W3 Total Cache, or LiteSpeed)
7. Install an SEO plugin (Yoast SEO or Rank Math) — they will extend the meta hooks

---

## Development Notes

- All CSS uses custom properties — override in `style.css` child theme or Customizer
- Mobile-first breakpoints: `375px` base → `768px` → `1024px`
- No build step required — plain CSS + vanilla JS
- Google Fonts loaded via `wp_enqueue_style` with `display=swap`
- jQuery is NOT loaded (removed migrate, no dependency)
- `main.js` deferred, loaded in footer

---

## License

GPL v2 or later — https://www.gnu.org/licenses/gpl-2.0.html

Common Ladder is a civic platform. This theme is free to use, modify, and redistribute under the GPL.
