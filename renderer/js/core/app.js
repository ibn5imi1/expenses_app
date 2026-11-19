// الكائن العام: كل صفحة تسجّل نفسها هنا، وكل الصفحات تتشارك القوائم
const App = {
    user: null,                                                  // المستخدم الحالي
    pages: {},                                                   // اسم الصفحة -> { refresh, fillLists, ... }
    lists: { destinations: [], spenders: [], sources: [] },     // القوائم المشتركة
    registerPage(name, api) { this.pages[name] = api; },
    // App.showPage و App.refreshAll تُعرَّفان في app/nav.js
};