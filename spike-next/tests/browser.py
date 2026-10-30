"""Run with local server at :4173; requires Python Playwright + Chromium."""
from playwright.sync_api import sync_playwright
import json

BASE = 'http://127.0.0.1:4173/'

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        checks = []
        for width, height in [(360, 800), (390, 844), (768, 1024), (1440, 1000)]:
            context = browser.new_context(viewport={'width': width, 'height': height})
            page = context.new_page()
            errors, external, methods = [], [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda req: external.append(req.url) if not req.url.startswith(BASE) else None)
            page.on('request', lambda req: methods.append(req.method))
            page.goto(BASE + '?utm_source=qa')
            page.wait_for_selector('#intro[open]')
            assert page.locator('#video-placeholder').is_visible()
            # Native dialog traps focus and Escape restores a meaningful opener.
            for _ in range(8):
                page.keyboard.press('Tab')
                assert page.evaluate("document.querySelector('#intro').contains(document.activeElement)")
            page.keyboard.press('Escape')
            assert not page.locator('#intro').is_visible()
            assert page.locator('#watch').evaluate('(e) => e === document.activeElement')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#theme').click()
            assert page.locator('html').get_attribute('data-theme') == 'light'
            page.reload()
            assert page.locator('html').get_attribute('data-theme') == 'light'
            page.locator('#opt-out').click()
            page.reload()
            assert not page.locator('#intro').is_visible()
            page.locator('#watch').click()
            page.keyboard.press('Escape')
            page.locator('[data-audience="parent"]').click()
            assert page.locator('#audience-title').inner_text() == 'Make space for your next chapter.'
            page.locator('input[name=goal][value=literacy]').check()
            page.locator('input[name=interest][value=literacy]').check()
            page.locator('input[name=pace][value=pathway]').check()
            page.locator('#reflection-form button[type=submit]').click()
            assert 'Free Financial Literacy Sessions' in page.locator('#reflection-result').inner_text()
            page.locator('#reflection-signup').click()
            assert page.locator('#invitation').input_value() == 'literacy'
            assert page.locator('#signup-audience').input_value() == 'parent'
            page.locator('#signup-next').click()
            page.locator('#signup-submit').click()
            assert page.locator('#name').get_attribute('aria-invalid') == 'true'
            page.locator('#name').fill('Demo Person')
            page.locator('#email').fill('real@company.ph')
            page.locator('#consent').check()
            page.locator('#signup-submit').click()
            assert 'synthetic' in page.locator('#email-error').inner_text()
            page.locator('#email').fill('demo@example.com')
            for scenario, expected in [('rejected', 'rejected'), ('networkError', 'could not confirm'), ('accepted', 'Demo acknowledged')]:
                page.locator('#mock-scenario').select_option(scenario)
                page.locator('#signup-submit').click()
                page.wait_for_function('document.querySelector("#signup-submit").disabled === false')
                assert expected in page.locator('#signup-result').inner_text()
            assert page.locator('#name').input_value() == ''
            page.keyboard.press('Escape')
            assert page.locator('#reflection-signup').evaluate('(e) => e === document.activeElement')
            assert set(methods) == {'GET'}
            assert not external, external
            assert not errors, errors
            stored = page.evaluate('Object.keys(localStorage)')
            assert sorted(stored) == ['spike-next-skip-intro', 'spike-next-theme']
            assert page.evaluate('document.cookie') == ''
            checks.append({'viewport': [width, height], 'interaction': 'passed', 'external_requests': external, 'console_errors': errors})
            context.close()
        # Reduced motion + denied storage still permits intro exit, signup and theme switching.
        context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        context.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });")
        page = context.new_page()
        page.goto(BASE)
        page.wait_for_selector('#intro[open]')
        assert page.locator('#intro-video').evaluate('(e) => e.paused')
        page.keyboard.press('Escape')
        page.locator('#theme').click()
        assert page.locator('html').get_attribute('data-theme') == 'light'
        page.locator('.mobile-cta button').click()
        page.locator('#signup-next').click()
        page.locator('#name').fill('Demo Person')
        page.locator('#email').fill('demo@example.com')
        page.locator('#consent').check()
        page.locator('#signup-submit').click()
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)
        page.locator('.mobile-cta button').click()
        assert page.locator('#signup-result').inner_text() == ''
        page.keyboard.press('Escape')
        checks.append({'reduced_motion': 'passed', 'storage_denied': 'passed', 'closed_request_response_ignored': 'passed'})
        context.close()
        browser.close()
        print(json.dumps(checks, indent=2))

if __name__ == '__main__':
    run()
