'use babel';

import PinegrowAtomView from './pinegrow-atom-view';
import { CompositeDisposable } from 'atom';
import { Range } from 'atom';

import {$, TextEditorView, View} from 'atom-space-pen-views';

var pg = require('./pg-parser.js');


var io = require('socket.io-client');
var pinegrow_url = 'http://localhost:40001/editor';
var editor_api = null;

var currentSourceNodes = {};

var doWithCurrentSourceNodeForEditor = function(editor, func) {
  var url = getEditorUrl(editor);
  if(currentSourceNodes[url]) {
      func(currentSourceNodes[url]);
  } else {
      var p = new pg.pgParser();
      p.assignIds = false;
      p.parse(editor.getText(), function() {
          currentSourceNodes[url] = p.rootNode;
          func(currentSourceNodes[url]);
      });
  }
}

var sourceChanged = function(url) {
    currentSourceNodes[url] = null;
}

var getEditorUrl = function(editor) {
    var file = editor.getPath();
    var f = 'file://';
    var path = require('path');
    if(file.match(/^[a-z]\:/i)) {
        //win, c://ppp
        file = '/' + file
    } else if(file.startsWith('\\\\')) {
        //win, //sfp/aaa/aaa
        file = file.substr(2);
    }
    return f + encodeURI(file.replace(/\\/g, "/"));
}

export default {

  config: {
    pinegrowUrl: {
      type: 'string',
      default: 'http://localhost:40000',
      title: 'Pinegrow url with port',
      description: 'Url with hostname and port of Pinegrow\'s internal webserver. Note that port + 1 will be used for code editor communication.'
    }
  },

  pinegrowAtomView: null,
  modalPanel: null,
  subscriptions: null,
  statusBarTile: null,
  statusBarElement: $('<div>PG</div>'),
  filesOpenInPinegrow: [],

  isFileOpenInPinegrow(url) {
      return this.filesOpenInPinegrow.indexOf(url) >= 0;
  },

  initEditorApi() {
    var _this = this;

    var urlparts = atom.config.get('pinegrow-atom.pinegrowUrl').split(':');
    if(urlparts.length == 2) {
      urlparts.push(40000);
    }
    if(urlparts.length > 2) {
      urlparts[urlparts.length-1] = parseInt(urlparts[urlparts.length-1]) + 1;
    }
    var url = urlparts.join(':') + '/editor';

    if(editor_api) editor_api.destroy();

    editor_api = io.connect(url);

    editor_api.on('connect', function () {
        atom.notifications.addSuccess("Connected to Pinegrow.");
    });

    editor_api.on('disconnect', function () {
        atom.notifications.addWarning("Disconnected from Pinegrow.");
    });

    editor_api.on('error', function () {
        atom.notifications.addError("Unable to connect to Pinegrow at " + url + '.');
    });

    var last_error_url = null;
    editor_api.on('connect_error', function () {
      if(last_error_url != url) {
        atom.notifications.addError("Unable to connect to Pinegrow at " + url + '.');
        last_error_url = url;
      }
    });

    editor_api.on('codeChanged', function (data) {
        //console.log('code changed');
        var editors = atom.workspace.getTextEditors();
        editors.forEach(function(editor) {
            if('file://' + editor.getPath() == data.url) {
                editor.setText(data.code);
                sourceChanged(data.url);
            }
        })
    });

    editor_api.on('elementSelectedInPreview', function (data) {
        var editors = atom.workspace.getTextEditors();
        editors.forEach(function(editor) {
            if(getEditorUrl(editor) == data.url) {
                doWithCurrentSourceNodeForEditor(editor, function(sourceNode) {
                    var node = sourceNode.getNodeFromPath(data.path);
                    if(node) {
                        var sourcePos = node.getPositionInSource();

                        var posStart =  editor.getBuffer().positionForCharacterIndex(sourcePos.start);
                        var posEnd =  editor.getBuffer().positionForCharacterIndex(sourcePos.end);

                        var range = new Range(posStart, posEnd);
                        editor.setSelectedBufferRange(range);
                    }
                })
            }
        })
    });

    editor_api.on('listOfOpenFiles', function(data) {
        console.log(data.list);
        _this.filesOpenInPinegrow = data.list;
    })
  },

  activate(state) {
    var _this = this;

    this.pinegrowAtomView = new PinegrowAtomView(state.pinegrowAtomViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.pinegrowAtomView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'pinegrow-atom:select-in-pg': () => this.selectInPinegrow()
    }));

    atom.config.observe('pinegrow-atom.pinegrowUrl', function(newValue) {
        console.log(newValue);
        _this.initEditorApi();
    })

/*
    atom.contextMenu.add({
      'atom-text-editor': [{
        label: 'Select in Pinegrow',
        command: 'pinegrow-atom:select-in-pg',
        created: function(event) {
            console.log(event);
        }
      }]
    })
*/


    atom.workspace.observeTextEditors(function(editor) {
        editor.onDidStopChanging(function() {
            var url = getEditorUrl(editor);
            if(_this.isFileOpenInPinegrow(url)) {
                editor_api.emit('codeChangedInEditor', {url: url, code: editor.getText()});
            }
        });

        editor.onDidChange(function() {
            sourceChanged(getEditorUrl(editor));
        })

        editor.onDidChangeCursorPosition(function(event) {

        })
    })
  },

  selectInPinegrow(event) {
    var editor = atom.workspace.getActiveTextEditor();
    if(editor) {
        var url = getEditorUrl(editor);
        if(this.isFileOpenInPinegrow(url)) {
          var idx = editor.getBuffer().characterIndexForPosition(editor.getCursorBufferPosition());
          doWithCurrentSourceNodeForEditor(editor, function(sourceNode) {
              var node = sourceNode.findNodeAtSourceIndex(idx);
              if(node) {
                  var path = node.getPath();
                  editor_api.emit('elementSelectedInEditor', {url: getEditorUrl(editor), path: path});
              }
          })
      }
    }
  },

  consumeStatusBar(statusBar) {
      statusBarTile = statusBar.addLeftTile({item: this.statusBarElement, priority: 100})
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.pinegrowAtomView.destroy();
    statusBarTile.destroy();
    statusBarTile = null;
  },

  serialize() {
    return {
      pinegrowAtomViewState: this.pinegrowAtomView.serialize()
    };
  },

  toggle() {
    console.log('PinegrowAtom was toggled!');
    return (
      this.modalPanel.isVisible() ?
      this.modalPanel.hide() :
      this.modalPanel.show()
    );
  }

};
