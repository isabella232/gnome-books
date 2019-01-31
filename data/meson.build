subdir('icons')

# FIXME: this is a workaround for libgd source location
libgd_src_path = join_paths(meson.source_root(), 'subprojects', 'libgd', 'libgd')

enum_headers = files(
  join_paths(libgd_src_path, 'gd-main-view.h'),
  join_paths(libgd_src_path, 'gd-main-view-generic.h')
)

gnome.mkenums(
  'org.gnome.Documents.enums.xml',
  sources: enum_headers,
  comments: '<!-- @comment@ -->',
  fhead: '<schemalist>',
  vhead: '  <@type@ id="org.gnome.Documents.@EnumName@">',
  vprod: '    <value nick="@valuenick@" value="@valuenum@"/>',
  vtail: '  </@type@>',
  ftail: '</schemalist>',
  install_header: true,
  install_dir: books_schemadir
)

resource_data = files(
  'application.css',
  'media/dnd-counter.svg',
  'media/thumbnail-frame.png',
  'ui/books-app-menu.ui',
  'ui/help-overlay.ui',
  'ui/help-overlay.ui',
  'ui/organize-collection-dialog.ui',
  'ui/preview-context-menu.ui',
  'ui/preview-menu.ui',
  'ui/selection-menu.ui',
  'ui/selection-toolbar.ui',
  'ui/view-menu.ui'
)

desktop_file_validate = find_program('desktop-file-validate', required: false)
appstream_util = find_program('appstream-util', required: false)

resource = 'org.gnome.Books.data'

sources += gnome.compile_resources(
  resource,
  resource + '.gresource.xml',
  source_dir: '.',
  dependencies: resource_data,
  gresource_bundle: true,
  install: true,
  install_dir: books_pkgdatadir
)

appdata = 'org.gnome.Books.appdata.xml'

appdata_file = i18n.merge_file(
  appdata,
  input: appdata + '.in',
  output: appdata,
  po_dir: po_dir,
  install: true,
  install_dir: join_paths(books_datadir, 'metainfo')
)
if appstream_util.found()
  test(
      'validate-appdata', appstream_util,
      args: [
          'validate-relax', '--nonet', appdata_file.full_path()
      ]
  )
  endif


desktop = 'org.gnome.Books.desktop'

desktop_file = i18n.merge_file(
  desktop,
  type: 'desktop',
  input: desktop + '.in',
  output: desktop,
  po_dir: po_dir,
  install: true,
  install_dir: join_paths(books_datadir, 'applications')
)
if desktop_file_validate.found()
  test(
      'validate-desktop',
      desktop_file_validate,
      args: [
          desktop_file.full_path()
      ]
  )
endif

install_data(
  'org.gnome.books.gschema.xml',
  install_dir: books_schemadir
)
