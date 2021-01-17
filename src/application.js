/*
 * Copyright (c) 2011, 2012, 2014, 2015 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const _ = imports.gettext.gettext;

const EvDoc = imports.gi.EvinceDocument;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Tracker = imports.gi.Tracker;

const ChangeMonitor = imports.changeMonitor;
const Format = imports.format;
const MainWindow = imports.mainWindow;
const Notifications = imports.notifications;
const Properties = imports.properties;
const Query = imports.query;
const Search = imports.search;
const Selections = imports.selections;
const TrackerController = imports.trackerController;
const TrackerUtils = imports.trackerUtils;
const Utils = imports.utils;
const WindowMode = imports.windowMode;

// used globally
var application = null;
var connection = null;
var connectionQueue = null;
var settings = null;

// used by the application, but not by the search provider
var changeMonitor = null;
let cssProvider = null;
var documentManager = null;
var modeController = null;
var notificationManager = null;
var offsetCollectionsController = null;
var offsetDocumentsController = null;
var offsetSearchController = null;
var queryBuilder = null;
var searchController = null;
var searchMatchManager = null;
var searchTypeManager = null;
var selectionController = null;
var sourceManager = null;
var trackerCollectionsController = null;
var trackerDocumentsController = null;
var trackerSearchController = null;

const TrackerMinerFilesIndexIface = '<node> \
<interface name="org.freedesktop.Tracker3.Miner.Files.Index"> \
    <method name="IndexLocation"> \
        <arg name="file_uri" type="s" /> \
        <arg name="graphs" type="as" /> \
        <arg name="flags" type="as" /> \
    </method> \
</interface> \
</node>';

var TrackerMinerFilesControlProxy = Gio.DBusProxy.makeProxyWrapper(TrackerMinerFilesIndexIface);
function TrackerMinerFilesControl() {
    return new TrackerMinerFilesControlProxy(Gio.DBus.session,
                                             'org.freedesktop.Tracker3.Miner.Files.Control',
                                             '/org/freedesktop/Tracker3/Miner/Files/Index');
}

const MINER_REFRESH_TIMEOUT = 60; /* seconds */

var Application = new Lang.Class({
    Name: 'Application',
    Extends: Gtk.Application,
    Signals: {
        'miners-changed': {}
    },

    _init: function() {
        this.minersRunning = [];
        this._activationTimestamp = Gdk.CURRENT_TIME;
        this._minerControl = null;

        let appid;
        GLib.set_application_name(_("Books"));
        appid = 'org.gnome.Books';

        // needed by data/ui/view-menu.ui
        GObject.type_ensure(Gio.ThemedIcon);

        this.parent({ application_id: appid });

        this.add_main_option('version', 'v'.charCodeAt(0), GLib.OptionFlags.NONE, GLib.OptionArg.NONE,
                             _("Show the version of the program"), null);
    },

    _nightModeCreateHook: function(action) {
        settings.connect('changed::night-mode', Lang.bind(this,
            function() {
                let state = settings.get_value('night-mode');
                if (state.get_boolean() != action.state.get_boolean())
                    action.change_state(state);

                let gtkSettings = Gtk.Settings.get_default();
                gtkSettings.gtk_application_prefer_dark_theme = state.get_boolean();
            }));

        let state = settings.get_value('night-mode');
        let gtkSettings = Gtk.Settings.get_default();
        gtkSettings.gtk_application_prefer_dark_theme = state.get_boolean();
    },

    _onActionQuit: function() {
        this._mainWindow.destroy();
    },

    _onActionAbout: function() {
        this._mainWindow.showAbout();
    },

    _onActionNightMode: function(action) {
        let state = action.get_state();
        settings.set_value('night-mode', GLib.Variant.new('b', !state.get_boolean()));
    },

    _themeChanged: function(gtkSettings) {
        let screen = Gdk.Screen.get_default();

        if (gtkSettings.gtk_theme_name == 'Adwaita') {
            if (cssProvider == null) {
                cssProvider = new Gtk.CssProvider();
                let file = Gio.File.new_for_uri("resource:///org/gnome/Documents/application.css");
                cssProvider.load_from_file(file);
            }

            Gtk.StyleContext.add_provider_for_screen(screen,
                                                     cssProvider,
                                                     Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        } else if (cssProvider != null) {
            Gtk.StyleContext.remove_provider_for_screen(screen, cssProvider);
        }
    },

    vfunc_startup: function() {
        this.parent();
        String.prototype.format = Format.format;

        EvDoc.init();

        application = this;
        settings = new Gio.Settings({ schema_id: 'org.gnome.books' });

        let gtkSettings = Gtk.Settings.get_default();
        gtkSettings.connect('notify::gtk-theme-name', Lang.bind(this, this._themeChanged));
        this._themeChanged(gtkSettings);

        // connect to tracker
        try {
            let cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'org.gnome.Books', 'db']);
            let nepomuk = Tracker.sparql_get_ontology_nepomuk();
            connection = Tracker.SparqlConnection.new(Tracker.SparqlConnectionFlags.NONE,
                                                      Gio.File.new_for_path(cacheDir),
                                                      nepomuk, null);
        } catch (e) {
            logError(e, 'Unable to set up the tracker database');
            return;
        }

        connectionQueue = new TrackerController.TrackerConnectionQueue();
        changeMonitor = new ChangeMonitor.TrackerChangeMonitor();

        // now init application components
        Search.initSearch(imports.application);

        modeController = new WindowMode.ModeController();
        offsetCollectionsController = new Search.OffsetCollectionsController();
        offsetDocumentsController = new Search.OffsetDocumentsController();
        offsetSearchController = new Search.OffsetSearchController();
        trackerCollectionsController = new TrackerController.TrackerCollectionsController();
        trackerDocumentsController = new TrackerController.TrackerDocumentsController();
        trackerSearchController = new TrackerController.TrackerSearchController();
        selectionController = new Selections.SelectionController();

        let actionEntries = [
            { name: 'quit',
              callback: Lang.bind(this, this._onActionQuit),
              accels: ['<Primary>q'] },
            { name: 'about',
              callback: Lang.bind(this, this._onActionAbout) },
            { name: 'night-mode',
              callback: Lang.bind(this, this._onActionNightMode),
              create_hook: Lang.bind(this, this._nightModeCreateHook),
              state: settings.get_value('night-mode') },
        ];

        Utils.populateActionGroup(this, actionEntries, 'app');
    },

    _createWindow: function() {
        if (this._mainWindow)
            return;

        notificationManager = new Notifications.NotificationManager();
        this._mainWindow = new MainWindow.MainWindow(this);
        this._mainWindow.connect('destroy', Lang.bind(this, this._onWindowDestroy));

        try {
            this._minerControl = TrackerMinerFilesControl();
            this._minerControl.IndexLocationRemote(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOCUMENTS),
                                                   ['tracker:Documents'], []);
        } catch (e) {
            logError(e, 'Unable to connect to the tracker extractor');
        }
    },

    vfunc_handle_local_options: function(options) {
        if (options.contains('version')) {
            print(pkg.version);
            return 0;
        }

        return -1;
    },

    vfunc_activate: function() {
        if (!this._mainWindow) {
            this._createWindow();
            modeController.setWindowMode(WindowMode.WindowMode.DOCUMENTS);
        }

        this._mainWindow.present_with_time(this._activationTimestamp);
        this._activationTimestamp = Gdk.CURRENT_TIME;
    },

    _clearState: function() {
        // clean up signals
        changeMonitor.disconnectAll();
        documentManager.disconnectAll();
        offsetCollectionsController.disconnectAll();
        offsetDocumentsController.disconnectAll();
        offsetSearchController.disconnectAll();
        trackerCollectionsController.disconnectAll();
        trackerDocumentsController.disconnectAll();
        trackerSearchController.disconnectAll();
        selectionController.disconnectAll();
        modeController.disconnectAll();

        // reset state
        documentManager.clearRowRefs();
        documentManager.setActiveItem(null);
        modeController.setWindowMode(WindowMode.WindowMode.NONE);
        selectionController.setSelection(null);
        notificationManager = null;
    },

    _onWindowDestroy: function(window) {
        this._mainWindow = null;

        // clear our state in an idle, so other handlers connected
        // to 'destroy' have the chance to perform their cleanups first
        Mainloop.idle_add(Lang.bind(this, this._clearState));
    },

    _onActivateResult: function(provider, urn, terms, timestamp) {
        this._createWindow();

        let doc = documentManager.getItemById(urn);
        if (doc) {
            doActivate.apply(this, [doc]);
        } else {
            let job = new TrackerUtils.SingleItemJob(urn, queryBuilder);
            job.run(Query.QueryFlags.UNFILTERED, Lang.bind(this,
                function(cursor) {
                    if (cursor)
                        doc = documentManager.addDocumentFromCursor(cursor);

                    doActivate.apply(this, [doc]);
                }));
        }

        function doActivate(doc) {
            documentManager.setActiveItem(doc);

            this._activationTimestamp = timestamp;
            this.activate();

            // forward the search terms next time we enter the overview
            let modeChangeId = modeController.connect('window-mode-changed', Lang.bind(this,
                function(object, newMode) {
                    if (newMode == WindowMode.WindowMode.DOCUMENTS) {
                        modeController.disconnect(modeChangeId);
                        searchController.setString(terms.join(' '));
                    }
                }));
        }
    },

    _onLaunchSearch: function(provider, terms, timestamp) {
        this._createWindow();
        modeController.setWindowMode(WindowMode.WindowMode.DOCUMENTS);
        searchController.setString(terms.join(' '));

        this._activationTimestamp = timestamp;
        this.activate();
    },

    getScaleFactor: function() {
        let scaleFactor = 1;
        if (this._mainWindow)
            scaleFactor = this._mainWindow.get_scale_factor();

        return scaleFactor;
    },

    getGdkWindow: function() {
        let window = null;
        if (this._mainWindow)
            window = this._mainWindow.get_window();

        return window;
    }
});
