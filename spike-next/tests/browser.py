"""Local frontend regression: Playwright + Chromium, preview on :4173."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json

BASE = 'http://127.0.0.1:4173/'

def enter(page, action='#intro-explore'):
    if page.locator('#intro').is_visible():
        page.locator(action).click()
    if not page.locator('#entry').is_visible():
        if not page.locator('#signup-suggestion').is_visible():
            page.locator('#watch').click()
            page.locator('#intro-explore').click()
        page.locator('#suggestion-signup').click()
    page.wait_for_selector('#entry[open]')
    page.locator('#intro-name').fill('Demo Visitor')
    page.locator('#intro-email').fill('visitor@example.com')
    page.locator('#intro-consent').check()
    page.locator('#intro-submit').click()
    page.wait_for_selector('#entry', state='hidden')
    assert 'Demo signup acknowledged' in page.locator('#entry-status').inner_text()

def contact(page):
    page.locator('#name').fill('Demo Candidate')
    page.locator('#email').fill('candidate@example.com')
    page.locator('#consent').check()
    page.locator('#mobile').fill('09000000000')
    page.locator('#contact-mode').select_option('virtual')
    page.locator('#availability').fill('Weekend mornings')

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        checks = []
        for width, height in [(320,568),(360,800),(390,844),(470,900),(844,390),(768,1024),(1440,1000)]:
            context = browser.new_context(viewport={'width':width,'height':height})
            page = context.new_page()
            errors, external, methods = [], [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: methods.append(request.method))
            page.on('request', lambda request: external.append(request.url) if not request.url.startswith(BASE) else None)
            page.goto(BASE+'?utm_source=qa')
            page.wait_for_selector('#intro[open]')
            for selector in ['#intro','#video-placeholder']:
                box = page.locator(selector).bounding_box()
                assert abs(box['x']) < 1 and abs(box['y']) < 1
                assert abs(box['width']-width) < 1 and abs(box['height']-height) < 1
            assert not page.locator('#intro-form').is_visible()
            for selector in ['#intro-close','#intro-explore']:
                box = page.locator(selector).bounding_box()
                assert box['y'] >= 0 and box['y']+box['height'] <= height+1
            for _ in range(6):
                page.keyboard.press('Tab')
                assert page.evaluate("document.querySelector('#intro').contains(document.activeElement)")
            # Close lands on a browsable page with an optional, dismissible prompt.
            page.locator('#intro-close').click()
            page.wait_for_selector('#signup-suggestion', state='visible')
            assert not page.locator('#entry').is_visible()
            page.locator('#suggestion-later').click()
            assert not page.locator('dialog[open]').count()
            assert not page.locator('#signup-suggestion').is_visible()
            headings = page.locator('.hero-benefit h2').all_inner_texts()
            assert [' '.join(text.split()) for text in headings] == ['Explore the opportunity.', 'Learn through SPIKE / RA-SPIKE.', 'Explore with 1CMA.']
            page.locator('#watch').click()
            page.keyboard.press('Escape')
            page.wait_for_selector('#signup-suggestion', state='visible')
            page.keyboard.press('Escape')
            assert not page.locator('#signup-suggestion').is_visible()
            page.locator('#watch').click()
            page.locator('#intro-explore').click()
            page.locator('#suggestion-signup').click()
            page.wait_for_selector('#entry[open]')
            close = page.locator('#entry [data-close]')
            assert close.is_visible()
            bounds = close.bounding_box()
            assert 0 <= bounds['y'] and bounds['y']+bounds['height'] <= height+1
            close.click()
            assert not page.locator('#entry').is_visible()
            page.locator('#suggestion-signup').click()
            page.keyboard.press('Escape')
            page.wait_for_selector('#entry', state='hidden')
            page.locator('#suggestion-signup').click()
            page.locator('#intro-submit').click()
            assert page.locator('#intro-name').get_attribute('aria-invalid') == 'true'
            enter(page)
            page.wait_for_function("document.activeElement === document.querySelector('#main')")
            assert page.locator('#intro-name').input_value() == ''
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.evaluate("[...document.images].forEach(image => image.loading='eager')")
            page.wait_for_function("[...document.images].every(image => image.complete && image.naturalWidth > 0)")
            page.locator('#theme').click()
            assert page.locator('html').get_attribute('data-theme') == 'light'
            # Returning visitors browse directly; signup and existing CTAs remain available.
            page.reload()
            assert not page.locator('dialog[open]').count()
            assert page.locator('html').get_attribute('data-theme') == 'light'
            page.locator('#watch').click()
            enter(page, '#intro-explore')
            page.locator('[data-audience=parent]').click()
            assert page.locator('#audience-title').inner_text() == 'Make space for your next chapter.'
            for name,value in [('goal','literacy'),('interest','literacy'),('pace','pathway')]:
                page.locator(f'input[name={name}][value={value}]').check()
            page.locator('#reflection-form button[type=submit]').click()
            page.locator('#reflection-signup').click()
            assert page.locator('#invitation').input_value() == 'literacy'
            page.locator('#signup-next').click()
            contact(page)
            page.locator('#business-goal').fill('Build financial confidence')
            page.locator('#topic').select_option('budgeting')
            page.locator('#date-of-birth').fill('2000-01-01')
            page.locator('#address').fill('123 Demo Street')
            page.locator('#civil-status').select_option('prefer-not')
            for scenario,expected in [('rejected','rejected'),('networkError','could not confirm'),('accepted','Demo acknowledged')]:
                page.locator('#mock-scenario').select_option(scenario)
                page.locator('#signup-submit').click()
                page.wait_for_function('!document.querySelector("#signup-submit").disabled')
                assert expected in page.locator('#signup-result').inner_text()
            page.keyboard.press('Escape')
            assert set(methods) == {'GET'} and not external and not errors
            assert sorted(page.evaluate('Object.keys(localStorage)')) == ['spike-next-skip-intro','spike-next-theme']
            assert page.evaluate('document.cookie') == ''
            checks.append({'viewport':[width,height],'fullscreen_video_optional_prompt_and_mobile_headings':'passed','external_requests':external,'console_errors':errors})
            context.close()
        # Signup still works when reduced motion is requested and storage is denied.
        context = browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
        context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw Error('Storage denied')}})")
        page = context.new_page(); page.goto(BASE)
        page.wait_for_selector('#intro[open]')
        assert page.locator('#intro-video').evaluate('(element)=>element.paused')
        enter(page)
        page.locator('[data-signup=pathway]').click()
        page.locator('#signup-next').click(); contact(page)
        assert page.locator('#pathway-gender option[value=prefer-not]').count() == 0
        assert page.locator('#pathway-civil-status option[value=prefer-not]').count() == 0
        page.locator('#pathway-gender').select_option('woman')
        page.locator('#pathway-civil-status').select_option('single')
        page.locator('#occupation').fill('Demo professional')
        page.locator('#education').select_option('graduate')
        page.locator('#motivation').fill('Explore financial entrepreneurship development')
        page.locator('#commitment').select_option('discuss')
        page.locator('#signup-submit').click()
        assert 'dummy' in page.locator('#document-error').inner_text()
        page.locator('#supporting-document').set_input_files({'name':'dummy.txt','mimeType':'text/plain','buffer':b'dummy'})
        page.locator('#signup-submit').click()
        assert 'dummy' in page.locator('#document-error').inner_text()
        page.locator('#supporting-document').set_input_files({'name':'dummy.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4 dummy only'})
        page.locator('#signup-submit').click()
        page.wait_for_function('!document.querySelector("#signup-submit").disabled')
        close = page.locator('#signup [data-close]')
        bounds = close.bounding_box()
        assert 0 <= bounds['y'] and bounds['y']+bounds['height'] <= 845
        assert 'Demo acknowledged' in page.locator('#signup-result').inner_text()
        assert page.locator('#supporting-document').evaluate('(element)=>element.files.length') == 0
        context.close()
        config_source = (Path(__file__).parent.parent/'src/config.js').read_text()
        for scenario,expected in [('rejected','rejected'),('networkError','could not confirm')]:
            context = browser.new_context(viewport={'width':390,'height':844})
            context.route('**/src/config.js',lambda route,request,state=scenario:route.fulfill(content_type='text/javascript',body=config_source.replace("mockScenario: 'accepted'","mockScenario: '"+state+"'")))
            page=context.new_page();page.goto(BASE)
            page.locator('#intro-explore').click()
            page.locator('#suggestion-signup').click()
            page.locator('#intro-name').fill('Demo Visitor');page.locator('#intro-email').fill('visitor@example.com');page.locator('#intro-consent').check()
            page.locator('#intro-submit').click()
            page.wait_for_function('!document.querySelector("#intro-submit").disabled')
            assert page.locator('#entry').is_visible()
            assert expected in page.locator('#intro-result').inner_text()
            assert page.locator('#signup-suggestion').is_visible()
            page.keyboard.press('Escape')
            page.wait_for_selector('#entry', state='hidden')
            context.close()
        checks.append({'reduced_motion_storage_denial_visible_close_document_validation_and_dismissible_failure':'passed'})
        browser.close();print(json.dumps(checks,indent=2))

if __name__=='__main__': run()
