"""Run with local server at :4173; requires Python Playwright + Chromium."""
from playwright.sync_api import sync_playwright
import json

BASE = 'http://127.0.0.1:4173/'

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        checks = []
        for width, height in [(320, 568), (360, 800), (390, 844), (844, 390), (768, 1024), (1440, 1000)]:
            context = browser.new_context(viewport={'width': width, 'height': height})
            page = context.new_page()
            errors, external, methods = [], [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda req: external.append(req.url) if not req.url.startswith(BASE) else None)
            page.on('request', lambda req: methods.append(req.method))
            page.goto(BASE + '?utm_source=qa')
            page.wait_for_selector('#intro[open]')
            assert page.locator('#video-placeholder').is_visible()
            intro_box = page.locator('#intro').bounding_box()
            film_box = page.locator('#video-placeholder').bounding_box()
            assert abs(intro_box['x']) < 1 and abs(intro_box['width'] - width) < 1
            assert abs(intro_box['y']) < 1 and abs(intro_box['height'] - height) < 1
            assert abs(film_box['x']) < 1 and abs(film_box['width'] - width) < 1
            page.locator('#intro-submit').scroll_into_view_if_needed()
            control = page.locator('#intro-submit').bounding_box()
            assert control['y'] >= 0 and control['y'] + control['height'] <= height + 1
            assert page.locator('#intro [data-close]').count() == 0
            assert page.locator('h1').inner_text() == 'Build Your Enterprise.\nOwn Your Future.'
            page.evaluate("[...document.images].forEach(image => image.loading = 'eager')")
            page.wait_for_function("[...document.images].every(image => image.complete && image.naturalWidth > 0)")
            assert page.locator('[data-logo=spike] img').get_attribute('src').endswith('SPIKE_logo_dark_variant.png')
            assert page.locator('[data-logo=versa] img').get_attribute('src').endswith('Versa_logo.png')
            assert page.locator('.header-cma img').get_attribute('src').endswith('1CMA_logo.png')
            # Native dialog traps focus and Escape restores a meaningful opener.
            for _ in range(8):
                page.keyboard.press('Tab')
                assert page.evaluate("document.querySelector('#intro').contains(document.activeElement)")
            page.keyboard.press('Escape')
            assert not page.locator('#intro').is_visible()
            page.wait_for_function("document.activeElement === document.querySelector('#watch')")
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.locator('#theme').click()
            assert page.locator('html').get_attribute('data-theme') == 'light'
            assert page.locator('[data-logo=spike] img').get_attribute('src').endswith('SPIKE_logo_dark_variant.png')
            assert page.locator('.hero').evaluate('(element) => getComputedStyle(element).color') == 'rgb(248, 250, 252)'
            page.reload()
            assert page.locator('html').get_attribute('data-theme') == 'light'
            assert page.locator('[data-logo=spike] img').get_attribute('src').endswith('SPIKE_logo_dark_variant.png')
            assert page.locator('.hero').evaluate('(element) => getComputedStyle(element).color') == 'rgb(248, 250, 252)'
            page.locator('#intro-submit').click()
            assert page.locator('#intro-name').get_attribute('aria-invalid') == 'true'
            page.locator('#intro-name').fill('Demo Visitor')
            page.locator('#intro-email').fill('visitor@example.com')
            page.locator('#intro-consent').check()
            page.locator('#intro-submit').click()
            page.wait_for_selector('#intro', state='hidden')
            assert 'Demo signup acknowledged' in page.locator('#entry-status').inner_text()
            assert page.locator('#intro-name').input_value() == ''
            assert page.locator('#intro-email').input_value() == ''
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
            page.locator('#name').fill('')
            page.locator('#signup-submit').click()
            assert page.locator('#name').get_attribute('aria-invalid') == 'true'
            page.locator('#name').fill('Demo Person')
            page.locator('#email').fill('real@company.ph')
            page.locator('#consent').check()
            page.locator('#signup-submit').click()
            assert 'synthetic' in page.locator('#email-error').inner_text()
            page.locator('#email').fill('demo@example.com')
            page.locator('#mobile').fill('09000000000')
            page.locator('#contact-mode').select_option('virtual')
            page.locator('#availability').fill('Saturday mornings')
            page.locator('#business-goal').fill('Build confidence in financial planning')
            page.locator('#topic').select_option('budgeting')
            page.locator('#date-of-birth').fill('2000-01-01')
            page.locator('#address').fill('123 Demo Street')
            page.locator('#civil-status').select_option('prefer-not')
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
        page.locator('#intro-name').fill('Demo Visitor')
        page.locator('#intro-email').fill('visitor@example.com')
        page.locator('#intro-consent').check()
        page.locator('#intro-submit').click()
        page.wait_for_selector('#intro', state='hidden')
        page.locator('#theme').click()
        assert page.locator('html').get_attribute('data-theme') == 'light'
        page.locator('.mobile-cta button').click()
        page.locator('#signup-next').click()
        page.locator('#name').fill('Demo Person')
        page.locator('#email').fill('demo@example.com')
        page.locator('#consent').check()
        page.locator('#mobile').fill('09000000000')
        page.locator('#contact-mode').select_option('virtual')
        page.locator('#availability').fill('Saturday mornings')
        page.locator('#gender').select_option('prefer-not')
        page.locator('#signup-submit').click()
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)
        page.locator('.mobile-cta button').click()
        assert page.locator('#signup-result').inner_text() == ''
        page.keyboard.press('Escape')
        checks.append({'reduced_motion': 'passed', 'storage_denied': 'passed', 'closed_request_response_ignored': 'passed'})
        context.close()
        # Entry must stay open on rejected/offline responses and ignore late acknowledgement.
        config_source = (__import__('pathlib').Path(__file__).parent.parent / 'src/config.js').read_text()
        for scenario, expected in [('rejected', 'rejected'), ('networkError', 'could not confirm')]:
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            context.route('**/src/config.js', lambda route, request, state=scenario: route.fulfill(content_type='text/javascript', body=config_source.replace("mockScenario: 'accepted'", "mockScenario: '" + state + "'")))
            page = context.new_page()
            page.goto(BASE)
            page.locator('#intro-name').fill('Demo Visitor')
            page.locator('#intro-email').fill('visitor@example.com')
            page.locator('#intro-consent').check()
            page.locator('#intro-submit').click()
            page.wait_for_function('document.querySelector("#intro-submit").disabled === false')
            assert page.locator('#intro').is_visible()
            assert expected in page.locator('#intro-result').inner_text()
            assert page.locator('#intro-name').input_value() == 'Demo Visitor'
            assert page.evaluate("localStorage.getItem('spike-next-skip-intro')") is None
            context.close()
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        page.goto(BASE)
        page.locator('#intro-name').fill('Demo Visitor')
        page.locator('#intro-email').fill('visitor@example.com')
        page.locator('#intro-consent').check()
        page.locator('#intro-submit').click()
        page.keyboard.press('Escape')
        page.wait_for_timeout(500)
        assert not page.locator('#entry-status').is_visible()
        assert page.evaluate("localStorage.getItem('spike-next-skip-intro')") is None
        page.locator('#watch').click()
        assert page.locator('#intro-name').input_value() == ''
        context.close()
        checks.append({'entry_rejected_offline_and_stale_response': 'passed'})
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        requests = []
        page.on('request', lambda req: requests.append(req.method))
        page.goto(BASE)
        page.keyboard.press('Escape')
        page.locator('[data-signup=pathway]').click()
        page.locator('#signup-next').click()
        assert page.locator('#pathway-details').is_visible()
        assert not page.locator('#literacy-details').is_visible()
        assert not page.locator('#business-goal').is_visible()
        page.locator('#name').fill('Demo Candidate')
        page.locator('#email').fill('candidate@example.com')
        page.locator('#consent').check()
        page.locator('#mobile').fill('09000000000')
        page.locator('#contact-mode').select_option('virtual')
        page.locator('#availability').fill('Weekend mornings')
        assert page.locator('#pathway-gender option[value=prefer-not]').count() == 0
        assert page.locator('#pathway-civil-status option[value=prefer-not]').count() == 0
        page.locator('#pathway-gender').select_option('woman')
        page.locator('#pathway-civil-status').select_option('single')
        page.locator('#occupation').fill('Demo professional')
        page.locator('#education').select_option('graduate')
        page.locator('#motivation').fill('Explore a financial entrepreneurship development pathway')
        page.locator('#commitment').select_option('discuss')
        page.locator('#signup-submit').click()
        assert 'dummy' in page.locator('#document-error').inner_text()
        page.locator('#supporting-document').set_input_files({'name': 'dummy.txt', 'mimeType': 'text/plain', 'buffer': b'dummy only'})
        page.locator('#signup-submit').click()
        assert 'dummy' in page.locator('#document-error').inner_text()
        page.locator('#supporting-document').set_input_files({'name': 'dummy.pdf', 'mimeType': 'application/pdf', 'buffer': b'%PDF-1.4 dummy test file only'})
        page.locator('#signup-submit').click()
        page.wait_for_function('document.querySelector("#signup-submit").disabled === false')
        assert 'Demo acknowledged' in page.locator('#signup-result').inner_text()
        assert page.locator('#supporting-document').evaluate('(element) => element.files.length') == 0
        assert set(requests) == {'GET'}
        context.close()
        checks.append({'pathway_background_and_dummy_document_validation': 'passed', 'document_upload_requests': 0})

        browser.close()
        print(json.dumps(checks, indent=2))

if __name__ == '__main__':
    run()
