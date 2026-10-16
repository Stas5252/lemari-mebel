"""Browser regression tests. Run: python -m unittest discover -s tests -v."""
import functools
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import threading
import unittest
from playwright.sync_api import sync_playwright, expect


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(__file__).resolve().parents[1]
        handler = functools.partial(QuietHandler, directory=str(cls.root))
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        executable = os.environ.get('CHROMIUM_PATH')
        if not executable and Path('/usr/bin/chromium').exists():
            executable = '/usr/bin/chromium'
        cls.browser = cls.playwright.chromium.launch(executable_path=executable, args=['--no-sandbox'])
        cls.url = os.environ.get('CATALOG_TEST_URL', f'http://127.0.0.1:{cls.server.server_port}/')

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':1280,'height':900}, reduced_motion='reduce')
        self.context.route('https://yandex.ru/**', lambda route: route.abort())
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto(self.url, wait_until='domcontentloaded')

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def visible_cards(self):
        return self.page.locator('#cards .catalog-card:visible')

    def test_categories_show_only_the_selected_products(self):
        expect(self.page.locator('#catalogSearch')).to_have_count(1, timeout=1500)
        expect(self.visible_cards()).to_have_count(5)
        self.page.get_by_role('button', name='Шкафы', exact=True).click()
        expect(self.visible_cards()).to_have_count(1)
        expect(self.visible_cards().first).to_contain_text('Светлый распашной шкаф')
        self.page.get_by_role('button', name='Кухни', exact=True).click()
        expect(self.visible_cards()).to_have_count(4)
        self.page.get_by_role('button', name='Все проекты', exact=True).click()
        expect(self.visible_cards()).to_have_count(5)

    def test_search_empty_state_and_reset(self):
        expect(self.page.locator('#catalogSearch')).to_have_count(1, timeout=1500)
        self.page.get_by_label('Поиск по проектам').fill('  ВИТРИНАМИ  ')
        expect(self.visible_cards()).to_have_count(1)
        self.page.get_by_label('Поиск по проектам').fill('несуществующий проект')
        expect(self.visible_cards()).to_have_count(0)
        expect(self.page.locator('#catalogEmpty')).to_be_visible()
        self.page.locator('#catalogEmpty').get_by_role('button', name='Сбросить фильтры').click()
        expect(self.visible_cards()).to_have_count(5)
        expect(self.page.locator('#catalogEmpty')).not_to_be_visible()

    def test_filters_combine_and_sort(self):
        expect(self.page.locator('#catalogLayout')).to_have_count(1, timeout=1500)
        self.page.get_by_label('Планировка проекта').select_option('corner')
        self.page.get_by_label('Цветовое решение').select_option('light')
        expect(self.visible_cards()).to_have_count(2)
        self.page.get_by_label('Сортировка проектов').select_option('name-desc')
        titles = self.visible_cards().locator('h3').all_text_contents()
        self.assertEqual(titles, ['Светлая кухня до потолка', 'Кухня с рельефными фасадами'])

    def test_details_and_keyboard_focus(self):
        opener = self.page.locator('#cards [data-project-open]').first
        expect(opener).to_have_count(1, timeout=1500)
        opener.click()
        dialog = self.page.get_by_role('dialog', name='Светлая кухня с витринами')
        expect(dialog).to_be_visible()
        self.assertTrue(self.page.evaluate('!!document.activeElement.closest("#catalogDialog")'))
        self.page.set_viewport_size({'width':390,'height':667})
        dialog.evaluate('e => e.scrollTop = e.scrollHeight')
        expect(self.page.locator('#catalogDialogClose')).to_be_in_viewport()
        for _ in range(7):
            self.page.keyboard.press('Tab')
            self.assertTrue(self.page.evaluate('!!document.activeElement.closest("#catalogDialog")'))
        self.page.keyboard.press('Escape')
        expect(dialog).not_to_be_visible()
        expect(opener).to_be_focused()

    def test_project_selection_reaches_matching_calculator_layout(self):
        opener = self.page.locator('[data-project-open="ceiling"]')
        expect(opener).to_have_count(1, timeout=1500)
        opener.click()
        self.page.get_by_role('link', name='Рассчитать похожую кухню').click()
        expect(self.page.locator('#catalogDialog')).not_to_be_visible()
        expect(self.page.locator('#layout [data-v="corner"]')).to_have_attribute('aria-pressed','true')
        expect(self.page.locator('#catalogSelection')).to_contain_text('Светлая кухня до потолка')
        self.page.locator('[data-project-open="wardrobe"]').click()
        expect(self.page.locator('#catalogDialogPrimary')).to_have_attribute('href','tel:+79814340888')

    def test_mobile_filters_and_page_width(self):
        expect(self.page.locator('#catalogFilterToggle')).to_have_count(1, timeout=1500)
        self.page.set_viewport_size({'width':390,'height':844})
        expect(self.page.locator('#catalogFilters')).not_to_be_visible()
        self.page.get_by_role('button', name='Фильтры', exact=True).click()
        expect(self.page.locator('#catalogFilters')).to_be_visible()
        self.page.get_by_label('Цветовое решение').select_option('beige')
        expect(self.visible_cards()).to_have_count(1)
        for width in [320,375,390,430,620,768,1024,1280]:
            self.page.set_viewport_size({'width':width,'height':844})
            dimensions = self.page.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})')
            self.assertEqual(dimensions['width'], dimensions['scrollWidth'], dimensions)

    def test_catalog_content_survives_without_javascript(self):
        context = self.browser.new_context(java_script_enabled=False)
        context.route('https://yandex.ru/**', lambda route: route.abort())
        page = context.new_page()
        page.goto(self.url, wait_until='domcontentloaded')
        expect(page.locator('#cards .catalog-card:visible')).to_have_count(5, timeout=1500)
        expect(page.locator('#projects h2')).to_be_visible()
        expect(page.locator('#catalogSearch')).not_to_be_visible()
        context.close()


if __name__ == '__main__':
    unittest.main()
