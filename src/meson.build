# FIXME: are config.js and path.js (missing) not needed anymore?
'''
js_conf = configuration_data()
js_conf.set('PACKAGE_NAME', meson.project_name())
js_conf.set('PACKAGE_VERSION', books_version)
js_conf.set('GETTEXT_PACKAGE', meson.project_name())

js = 'config.js'

configure_file(
  input: js + '.in',
  output: js,
  configuration: js_conf
)
'''

headers = files(
  'lib/gd-bookmark.h',
  'lib/gd-bookmarks.h',
  'lib/gd-display-preview.h',
  'lib/gd-metadata.h',
  'lib/gd-nav-bar.h',
  'lib/gd-pdf-loader.h',
  'lib/gd-places-bookmarks.h',
  'lib/gd-places-links.h',
  'lib/gd-places-page.h',
  'lib/gd-utils.h'
)

sources = files(
  'lib/gd-bookmark.c',
  'lib/gd-bookmarks.c',
  'lib/gd-display-preview.c',
  'lib/gd-metadata.c',
  'lib/gd-nav-bar.c',
  'lib/gd-pdf-loader.c',
  'lib/gd-places-bookmarks.c',
  'lib/gd-places-links.c',
  'lib/gd-places-page.c',
  'lib/gd-utils.c',
)

resource_data = files(
  'application.js',
  'changeMonitor.js',
  'documents.js',
  'edit.js',
  'embed.js',
  'epubview.js',
  'errorBox.js',
  'evinceview.js',
  'fullscreenAction.js',
  'lokview.js',
  'main.js',
  'mainToolbar.js',
  'mainWindow.js',
  'manager.js',
  'notifications.js',
  'overview.js',
  'password.js',
  'places.js',
  'presentation.js',
  'preview.js',
  'properties.js',
  'query.js',
  'searchbar.js',
  'search.js',
  'selections.js',
  'shellSearchProvider.js',
  'testentry.js',
  'trackerController.js',
  'trackerUtils.js',
  'utils.js',
  'windowMode.js'
)

service_conf = configuration_data()
service_conf.set('bindir', books_bindir)

app_conf = configuration_data()
app_conf.set('prefix', books_prefix)
app_conf.set('libdir', books_libdir)
app_conf.set('PACKAGE_VERSION', books_version)
app_conf.set('GJS', gjs_console)

foreach app: books_apps
  service = app + '.service'

  configure_file(
    input: service + '.in',
    output: service,
    install: true,
    install_dir: join_paths(books_datadir, 'dbus-1', 'services'),
    configuration: service_conf
  )

  configure_file(
    input: app + '.in',
    output: app,
    install: true,
    install_dir: books_pkgdatadir,
    configuration: app_conf
  )

  resource = app + '.src'

  sources += gnome.compile_resources(
    resource,
    resource + '.gresource.xml',
    source_dir: '.',
    dependencies: resource_data,
    gresource_bundle: true,
    install: true,
    install_dir: books_pkgdatadir
  )
endforeach

incs = [
  top_inc,
  include_directories('lib')
]

cflags = [
  '-DPREFIX="@0@"'.format(books_prefix),
  '-DLIBDIR="@0@"'.format(books_libdir),
  '-DG_LOG_DOMAIN="Gdprivate"',
  '-DG_DISABLE_DEPRECATED'
]

libgdprivate = shared_library(
  '@0@-@1@'.format(books_private_ns.to_lower(), books_api_version),
  sources: sources,
  include_directories: incs,
  dependencies: books_deps,
  c_args: cflags,
  install: true,
  install_dir: books_pkglibdir,
  install_rpath: books_pkglibdir
)

gir_incs = [
  'GnomeDesktop-3.0',
  'Gtk-3.0',
  'EvinceDocument-3.0',
  'EvinceView-3.0',
]

gnome.generate_gir(
  libgdprivate,
  sources: sources + headers,
  nsversion: books_api_version,
  namespace: books_private_ns,
  identifier_prefix: books_ns,
  symbol_prefix: books_ns.to_lower(),
  includes: gir_incs,
  install: true,
  install_dir_gir: join_paths(books_pkgdatadir, 'gir-' + books_gir_version),
  install_dir_typelib: join_paths(books_pkglibdir, 'girepository-' + books_gir_version)
)
