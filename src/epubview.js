/*
 * Copyright (c) 2016 Daniel Garcia <danigm@wadobo.com>
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
 * Author: Daniel Garcia <danigm@wadobo.com>
 *
 */

const Gdk = imports.gi.Gdk;
const GdPrivate = imports.gi.GdPrivate;
const Gepub = imports.gi.Gepub;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const WebKit2 = imports.gi.WebKit2;

const _ = imports.gettext.gettext;

const Application = imports.application;
const Documents = imports.documents;
const Preview = imports.preview;
const Utils = imports.utils;

const Lang = imports.lang;

const ZOOM_LEVEL_STEP = 0.1;
const ZOOM_LEVEL_DEFAULT = 1.0;
const ZOOM_LEVEL_MIN = 0.5;
const ZOOM_LEVEL_MAX = 2.0;

function isEpub(mimeType) {
    return (mimeType == 'application/epub+zip');
}

var EPUBView = new Lang.Class({
    Name: 'EPUBView',
    Extends: Preview.Preview,

    createActions: function() {
        return [
            { name: 'find',
              callback: Utils.actionToggleCallback,
              state: GLib.Variant.new('b', false),
              stateChanged: Lang.bind(this, this._findStateChanged),
              accels: ['<Primary>f'] },
            { name: 'find-prev',
              callback: Lang.bind(this, this.findPrev),
              accels: ['<Shift><Primary>g'] },
            { name: 'find-next',
              callback: Lang.bind(this, this.findNext),
              accels: ['<Primary>g'] },
            { name: 'reset-zoom',
              callback: Lang.bind(this, this._resetZoom),
              accels: ['<Primary>0', '<Primary>KP_0'] },
            { name: 'zoom-in',
              callback: Lang.bind(this, this._zoomIn),
              accels: ['<Primary>plus', '<Primary>equal', '<Primary>KP_Add'] },
              { name: 'zoom-out',
              callback: Lang.bind(this, this._zoomOut),
              accels: ['<Primary>minus', '<Primary>KP_Subtract'] },
        ];
    },

    createToolbar: function() {
        return new EPUBViewToolbar(this);
    },

    createNavControls: function() {
        return new EPUBViewNavControls(this, this.overlay);
    },

    createView: function() {
        let view = new Gepub.Widget();

        this.invertedStyle = new WebKit2.UserStyleSheet(
            'body { background: black !important; filter: invert(100%); }',
            WebKit2.UserContentInjectedFrames.ALL_FRAMES,
            WebKit2.UserStyleLevel.USER,
            null, null,
        );

        let fc = view.get_find_controller();
        fc.connect('found-text', Lang.bind(this, function(view, matchCount, data) {
            let hasResults = matchCount > 0;

            this.getAction('find-prev').enabled = hasResults;
            this.getAction('find-next').enabled = hasResults;
        }));

        view.connect('button-release-event', Lang.bind(this,
            this._onButtonReleaseEvent));
        view.connect('scroll-event', Lang.bind(this, this._zoomContent));

        return view;
    },

    createContextMenu: function() {
        return null;
    },

    onLoadFinished: function(manager, doc) {
        this.parent(manager, doc);

        let f = Gio.File.new_for_uri(doc.uriToLoad);
        this._epubdoc = new Gepub.Doc({ path: f.get_path() });
        this._epubdoc.init(null);

        this.view.doc = this._epubdoc;
        this._epubdoc.connect('notify::chapter', Lang.bind(this, this._onChapterChanged));

        this._metadata = this._loadMetadata();

        this.set_visible_child_name('view');
        this.navControls.setDocument(this._epubdoc);
    },

    _loadMetadata: function() {
        let file = Gio.File.new_for_path(this._epubdoc.path);
        if (!GdPrivate.is_metadata_supported_for_file(file))
            return null;

        let metadata = new GdPrivate.Metadata({ file: file });

        let [res, val] = metadata.get_int('page');
        if (res)
            this._epubdoc.chapter = val;

        [res, val] = metadata.get_double('zoom');
        if (res) {
            this._setZoomLevel(val);
            this._updateZoomActions();
        }

        return metadata;
    },

    _onChapterChanged: function() {
        let pageNumber = this._epubdoc.chapter;
        if (this._metadata)
            this._metadata.set_int('page', pageNumber);
    },

    _onButtonReleaseEvent: function(widget, event) {
        let button = event.get_button()[1];
        let clickCount = event.get_click_count()[1];

        if (button == 1
            && clickCount == 1)
            this.queueControlsFlip();
        else
            this.cancelControlsFlip();

        return false;
    },

    goPrev: function() {
        this._epubdoc.go_prev();
    },

    goNext: function() {
        this._epubdoc.go_next();
    },

    get hasPages() {
        return this._epubdoc ? this._epubdoc.get_n_chapters() > 0 : false;
    },

    get page() {
        return this._epubdoc ? this._epubdoc.get_chapter() : 0;
    },

    get numPages() {
        return this._epubdoc ? this._epubdoc.get_n_chapters() : 0;
    },

    get canFullscreen() {
        return true;
    },

    set nightMode(v) {
        if (this.view) {
            if (v)
                this.view.get_user_content_manager().add_style_sheet(this.invertedStyle);
            else
                this.view.get_user_content_manager().remove_all_style_sheets();
        }
    },

    search: function(str) {
        this.parent(str);

        let fc = this.view.get_find_controller();
        fc.search(str, WebKit2.FindOptions.CASE_INSENSITIVE, 0);
    },

    _findStateChanged: function(action) {
        if (action.state.get_boolean()) {
            this.toolbar.searchbar.reveal();
        } else {
            this.toolbar.searchbar.conceal();

            let fc = this.view.get_find_controller();
            fc.search_finish();
        }
    },

    findNext: function() {
        let fc = this.view.get_find_controller();
        fc.search_next();
    },

    findPrev: function() {
        let fc = this.view.get_find_controller();
        fc.search_previous();
    },

    _zoomContent: function(view, event) {
        let accel_mask = Gtk.accelerator_get_default_mod_mask();
        if ((event.get_state()[1] & accel_mask) == Gdk.ModifierType.CONTROL_MASK) {
            let direction = event.get_scroll_deltas()[2];
            if (direction > 0) {
                this._zoomOut();
            } else {
                this._zoomIn();
            }
        }
    },

    _updateZoomActions: function() {
        let level = this.view.get_zoom_level()
        let canZoomOut = (level > ZOOM_LEVEL_MIN);
        let canZoomIn = (level < ZOOM_LEVEL_MAX);

        this.getAction('zoom-out').enabled = canZoomOut;
        this.getAction('zoom-in').enabled = canZoomIn;
    },

    _zoomOut: function() {
        let level = this.view.get_zoom_level();
        if (level <= ZOOM_LEVEL_MIN)
            return;
        this._setZoomLevel(Math.max(level - ZOOM_LEVEL_STEP, ZOOM_LEVEL_MIN));
        this._updateZoomActions();
    },

    _zoomIn: function() {
        let level = this.view.get_zoom_level();
        if (level >= ZOOM_LEVEL_MAX)
            return;
        this._setZoomLevel(Math.min(level + ZOOM_LEVEL_STEP, ZOOM_LEVEL_MAX));
        this._updateZoomActions();
    },

    _resetZoom: function() {
        this._setZoomLevel(ZOOM_LEVEL_DEFAULT);
        this._updateZoomActions();
    },

    _setZoomLevel: function(val) {
        this.view.set_zoom_level(val);
        if (this._metadata)
            this._metadata.set_double('zoom', val);
    }
});

const EPUBViewToolbar = new Lang.Class({
    Name: 'EPUBViewToolbar',
    Extends: Preview.PreviewToolbar,

    _init: function(preview) {
        this.parent(preview);

        this.addSearchButton('view.find');
    }
});

const EPUBViewNavControls = new Lang.Class({
    Name: 'EPUBViewNavControls',
    Extends: Preview.PreviewNavControls,

    _init: function(preview, overlay) {
        this._epubdoc = null;
        this.parent(preview, overlay);
    },

    setDocument: function(epubdoc) {
        this._epubdoc = epubdoc;

        if (this._epubdoc != null) {
            this._level.set_range(1.0, this.preview.numPages);
            this._epubdoc.connect('notify::chapter', Lang.bind(this, function() {
                this._updatePage();
                this._updateVisibility();
            }));
            this._updatePage();
        }
    },

    _updatePage: function() {
        let current = this.preview.page + 1;
        let max = this.preview.numPages;
        let text = _("chapter %s of %s").format(current, max);

        this._label.set_text(text);
        this._level.set_value(current);
    },

    createBarWidget: function() {
        let barWidget = new EPUBBarWidget({ orientation: Gtk.Orientation.HORIZONTAL,
                                            spacing: 10 });

        this._label = new Gtk.Label();
        barWidget.add(this._label);

        this._level = new Gtk.Scale({ orientation: Gtk.Orientation.HORIZONTAL });
        this._level.set_increments(1.0, 1.0);
        this._level.set_draw_value(false);
        this._level.set_digits(0);
        this._level.set_range(1.0, 1.0);
        barWidget.pack_start(this._level, true, true, 5);
        this._level.connect('value-changed', Lang.bind(this, function() {
            if (this._epubdoc != null)
                this._epubdoc.set_chapter(this._level.get_value() - 1);
        }));

        return barWidget;
    }
});

// This class is needed to change the css_name of the widget, to style as a
// toolbar, with round borders and the correct padding. Doing this we'll
// have the same styles as GdNavBar
const EPUBBarWidget = new Lang.Class({
    Name: 'EPUBBarWidget',
    Extends: Gtk.Box,
    CssName: 'toolbar'
});
