/*
 * Copyright (c) 2012 Red Hat, Inc.
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

const Gd = imports.gi.Gd;
const Gettext = imports.gettext;
const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Application = imports.application;
const WindowMode = imports.windowMode;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

var DELETE_TIMEOUT = 10; // seconds

var DeleteNotification = new Lang.Class({
    Name: 'DeleteNotification',

    _init: function(docs) {
        this._docs = docs;
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL,
                                     column_spacing: 12 });

        let msg;

        if (this._docs.length == 1 && this._docs[0].name) {
            // Translators: only one item has been deleted and %s is its name
            msg = (_("“%s” deleted")).format(this._docs[0].name);
        } else {
            // Translators: one or more items might have been deleted, and %d
            // is the count
            msg = Gettext.ngettext("%d item deleted",
                                   "%d items deleted",
                                   this._docs.length).format(this._docs.length);
        }

        let label = new Gtk.Label({ label: msg,
                                    halign: Gtk.Align.START });
        this.widget.add(label);

        let undo = new Gtk.Button({ label: _("Undo"),
                                    valign: Gtk.Align.CENTER });
        this.widget.add(undo);
        undo.connect('clicked', Lang.bind(this,
            function() {
                this._docs.forEach(Lang.bind(this,
                    function(doc) {
                        Application.documentManager.addItem(doc);
                    }));

                this._removeTimeout();
                this.widget.destroy();
            }));

        let close = new Gtk.Button({ image: new Gtk.Image({ icon_name: 'window-close-symbolic',
                                                            pixel_size: 16,
                                                            margin_top: 2,
                                                            margin_bottom: 2 }),
                                     valign: Gtk.Align.CENTER,
                                     focus_on_click: false,
                                     relief: Gtk.ReliefStyle.NONE });
        this.widget.add(close);
        close.connect('clicked', Lang.bind(this, this._deleteItems));

        Application.notificationManager.addNotification(this);
        this._timeoutId = Mainloop.timeout_add_seconds(DELETE_TIMEOUT, Lang.bind(this,
            function() {
                this._timeoutId = 0;
                this._deleteItems();
                return false;
            }));
    },

    _deleteItems: function() {
        this._docs.forEach(Lang.bind(this,
            function(doc) {
                doc.trash();
            }))

        this._removeTimeout();
        this.widget.destroy();
    },

    _removeTimeout: function() {
        if (this._timeoutId != 0) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }
});

var PrintNotification = new Lang.Class({
    Name: 'PrintNotification',

    _init: function(printOp, doc) {
        this.widget = null;
        this._printOp = printOp;
        this._doc = doc;

        this._printOp.connect('begin-print',
                              Lang.bind(this, this._onPrintBegin));
        this._printOp.connect('status-changed',
                              Lang.bind(this, this._onPrintStatus));
    },

    _onPrintBegin: function() {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     row_spacing: 6 });

        this._statusLabel = new Gtk.Label();
        this.widget.add(this._statusLabel);
        this._progressBar = new Gtk.ProgressBar();
        this.widget.add(this._progressBar);

        this._stopButton = new Gtk.Button({ image: new Gtk.Image({ icon_name: 'process-stop-symbolic',
                                                                   pixel_size: 16,
                                                                   margin_top: 2,
                                                                   margin_bottom: 2 }),
                                            margin_start: 12,
                                            valign: Gtk.Align.CENTER
                                            });
        this.widget.attach_next_to(this._stopButton, this._statusLabel,
                                   Gtk.PositionType.RIGHT, 1, 2);
        this._stopButton.connect('clicked', Lang.bind(this,
            function() {
                this._printOp.cancel();
                this.widget.destroy();
            }));

        Application.notificationManager.addNotification(this);
    },

    _onPrintStatus: function() {
        if (!this.widget)
            return;

        let status = this._printOp.get_status();
        let fraction = this._printOp.get_progress();
        status = _("Printing “%s”: %s").format(this._doc.name, status);

        this._statusLabel.set_text(status);
        this._progressBar.fraction = fraction;

        if (fraction == 1)
            this.widget.destroy();
    }
});

var NotificationManager = new Lang.Class({
    Name: 'NotificationManager',
    Extends: Gtk.Revealer,

    _init: function() {
        this.parent({ halign: Gtk.Align.CENTER,
                      valign: Gtk.Align.START });

        let frame = new Gtk.Frame();
        frame.get_style_context().add_class('app-notification');
        this.add(frame);

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                    row_spacing: 6 });

        frame.add(this._grid);
    },

    addNotification: function(notification) {
        this._grid.add(notification.widget);
        notification.widget.connect('destroy', Lang.bind(this, this._onWidgetDestroy));

        this.show_all();
        this.reveal_child = true;
    },

    _onWidgetDestroy: function() {
        let children = this._grid.get_children();

        if (children.length == 0)
            this.reveal_child = false;
    }
});
