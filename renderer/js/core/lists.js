// تحميل القوائم المشتركة، ثم إبلاغ كل صفحة لتعيد تعبئة قوائمها
async function loadLists() {
    const [destinations, spenders, sources] = await Promise.all([
        window.api.getDestinations(),
        window.api.getSpenders(),
        window.api.getSources(),
    ]);
    App.lists.destinations = destinations;
    App.lists.spenders = spenders;
    App.lists.sources = sources;

    Object.values(App.pages).forEach(page => page.fillLists && page.fillLists());
}