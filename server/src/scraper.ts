import { chromium, Browser } from "playwright";

export interface LookupResult {
  success: boolean;
  name: string | null;
  message: string;
}

const CANVAS_LOGIN_URL = "https://laconcepcioncollege.instructure.com/login/canvas";

// Reused across lookups — launching a fresh browser per request was the
// single biggest cost. Each lookup still gets its own context (so cookies
// / login state never leak between numbers), just not its own browser.
let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

/**
 * Logs in to Canvas with a SINGLE provided student number (used as both
 * username and password), and extracts the logged-in user's display name.
 *
 * This intentionally only ever attempts ONE login per call. It does not
 * generate or try ranges/combinations of credentials.
 */
export async function lookupStudentName(studentNumber: string): Promise<LookupResult> {
  if (!/^[0-9A-Za-z._-]{3,32}$/.test(studentNumber)) {
    return { success: false, name: null, message: "Invalid student number format." };
  }

  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();

    await page.goto(CANVAS_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // This Canvas instance uses the redesigned InstUI login form, where the
    // fields have no `name` attribute — just plain ids.
    const usernameSelector = "#username";
    const passwordSelector = "#password";
    const submitSelector = 'button[type="submit"]';

    await page.waitForSelector(usernameSelector, { timeout: 15000 });
    await page.fill(usernameSelector, studentNumber);
    await page.fill(passwordSelector, studentNumber);

    const errorLocator = page.locator(
      '.ic-flash-error, #flash_message_holder, [role="alert"], #error_box, .error_box'
    );

    await page.click(submitSelector);

    // Race: either we navigate away from /login (success), or an inline
    // error appears (failure — often AJAX-validated with no real
    // navigation, which is why blindly waiting on navigation stalls).
    const outcome = await Promise.race([
      page
        .waitForURL((url) => !url.toString().includes("/login"), { timeout: 10000 })
        .then(() => "navigated" as const)
        .catch(() => "timeout" as const),
      errorLocator
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => "error" as const)
        .catch(() => "timeout" as const),
    ]);

    if (outcome !== "navigated" && page.url().includes("/login")) {
      const errorText = await errorLocator.first().innerText().catch(() => "");
      return {
        success: false,
        name: null,
        message: errorText?.trim() || "Login failed — invalid credentials.",
      };
    }

    // On this Canvas instance (InstUI redesign) the user's display name is
    // the alt text on their avatar image inside the "Account" nav link.
    let name: string | null = await page
      .locator("#global_nav_profile_link img[alt]")
      .first()
      .getAttribute("alt")
      .catch(() => null);

    // Fallbacks for other Canvas themes, in case this ever runs against a
    // differently-configured instance.
    if (!name) {
      const fallbackSelectors = [
        "#global_nav_profile_display_name",
        ".ic-app-header__menu-list-link .ic-avatar + span",
        '[data-testid="user-name"]',
      ];
      for (const sel of fallbackSelectors) {
        const el = page.locator(sel).first();
        if (await el.count()) {
          const text = (await el.innerText().catch(() => ""))?.trim();
          if (text) {
            name = text;
            break;
          }
        }
      }
    }

    if (!name) {
      return {
        success: true,
        name: null,
        message: "Logged in, but couldn't locate the name element.",
      };
    }

    return { success: true, name, message: "OK" };
  } catch (err) {
    return {
      success: false,
      name: null,
      message: err instanceof Error ? err.message : "Unknown error during scrape.",
    };
  } finally {
    await context.close();
  }
}

/** Call on server shutdown to clean up the shared browser, if desired. */
export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}