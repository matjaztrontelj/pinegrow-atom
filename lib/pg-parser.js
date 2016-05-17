var pgIdCount = 0;
var pgObjectCount = 0;

var pgIdRegExp = new RegExp('\\s*data\\-pg\\-id="([0-9]+)"', 'i');
var pgIdRegExpReplace = new RegExp('\\s*data\\-pg\\-id="[0-9]+"', 'ig');
var pgWhiteSpaceRegExp = new RegExp('^[\\s\\n]*$');
var pgSelectorCache = {};
var pgDontFormat = ['p', 'span', 'bdo', 'em', 'strong', 'dfn', 'code', 'samp', 'kbd', 'var', 'cite', 'abbr', 'acronym', 'q', 'sub', 'sup', 'tt', 'i', 'b', 'big', 'small', 'u', 's', 'strike', 'font', 'ins', 'del', 'pre', 'address', 'dt', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br'];
var pgDontFormatIfAllChildrenNonFormat = ['a', 'td', 'th'];
var pgAutoClosedTags = { 'html' : [], 'head' : ['body'], 'body' : [], 'p' :  ['p', 'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'menu', 'nav', 'ol', 'pre', 'section', 'table', 'ul'], 'dd' : ['dd'], 'dt' : ['dt'], 'option' : ['option', 'optgroup'], 'optgroup' : ['optgroup'], 'thead' : ['tbody', 'tfoot'], 'th' : ['td', 'th'], 'tbody' : ['tfoot'], 'tr' : ['tr'], 'td'  : ['td', 'th'], 'tfoot' : ['tbody'], 'colgroup' : [], 'li' : ['li'] }
var pgSingleTags = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track', 'wbr', '!', '?php', '?=', '!doctype'];


var pgScripts = {
    '<?php' : { name: 'PHP', close: '?>' },
    '<?=' : { name: 'PHP Short', close: '?>' },
    '<%' : { name: 'ASP', close: '%>' }
}

var pgScriptsList = [];
var pgScriptsRegExp = null;

var pgPrepareScripts = function() {
    var re = '';
    $.each(pgScripts, function(key, def) {
        def.open = key;
        pgScriptsList.push(def);

        re += (re.length ? '|' : '') + '(' + escapeRegExp(def.open) + ')';
    });
    pgScriptsRegExp = new RegExp(re, 'i');
}

var pgHasScript = function(str) {
    return str.match(pgScriptsRegExp);
}

var pgAttributeEncode_re = /"/g;
var pgAttributeDecode_re = /&quot;/g;

var catchDisplayBug = function(h) {
    return;

    if(!h) return;
    if(h.indexOf('display:block') >= 0 || h.indexOf('display: block;') >= 0) {
        pinegrow.showQuickMessage('Found display:block!!!', 3000, true);
        console.log('Found display bug');
        console.trace();
    }
}

var pgEncodeAttribute = function(str) {
    if(str === null) return null;
    //if(pgHasScript(str)) return str;
    if(str.indexOf('<?') >= 0) return str;
    return str.replace(pgAttributeEncode_re, '&quot;');
}

var pgDecodeAttribute = function(str) {
    if(typeof str != 'string') return str;
    return str.replace(pgAttributeDecode_re, '"');
}

var pgParserException = function(msg, obj) {
    this.message = msg;
    this.name = "pgParserException";
    this.reference = obj;
}

var pgParserSourceProblem = function(node, $el, skip_locked) {
    this.message = "Can not edit source node.";
    this.name = "pgParserSourceProblem";
    this.node = node;
    this.$el = $el;

    var list = [];

    this.add = function(obj_type, obj, action, reason, msg) {
        if(!reason) reason = 'dynamic';
        list.push({obj_type: obj_type, obj: obj, action: action, reason: reason, msg: msg});
    }

    if(node && !skip_locked) {
        var locked = pinegrow.isElementLocked(node);
        if(locked) {
            this.add('element', $el ? getElementName($el) : "node", "change", 'custom', locked);
        }
    }

    this.ok = function() {
        return list.length == 0;
    }

    this.toString = function() {
        if(list.length == 0) return null;
        var s = '<ul>';
        for(var i = 0; i < list.length; i++) {
            var msg = '';
            var p = list[i];
            switch(p.obj_type) {
                case 'class':
                    msg = 'Class <b>' + p.obj + '</b>';
                    break;

                case 'element':
                    msg = 'Element <b>' + p.obj + '</b>';
                    break;
            }

            var reason;
            switch(p.reason) {
                default:
                    reason = 'because it was either: <b>added by a script</b>, <b>removed from the page</b> or <b>changed in the code editor without refreshing the page</b>';
            }
            if(p.msg) {
                reason = p.msg;
            }

            switch(p.action) {
                case 'remove':
                    msg += ' can\'t be <b>removed</b>';
                    break;
                case 'add':
                    msg += ' can\'t be <b>added</b>';
                    break;
                case 'change':
                    msg += ' can\'t be <b>changed</b>';
                    break;
                case 'find':
                    msg += ' does\'t <b>exist in source</b>';
                    break;
                case 'duplicate':
                    msg += ' cant\'t be <b>duplicated</b>';
                    break;
            }

            msg += ' ' + reason + '.';

            s += '<li>' + msg + '</li>';
        }
        s += '</ul>';
        return s;
    }

}

var pgParserNodeCatalogue = function() {

    var dict = {};

    this.clear = function() {
        dict = {};
    }

    this.add = function(node) {
        var id = node.getId();
        if(id) {
            dict[id] = node;
        }
    }

    this.get = function(id) {
        if(id in dict) {
            return dict[id];
        }
        return null;
    }

    this.remove = function(node) {
        var id = node.getId();
        if(id && (id in dict)) {
            if(node.objectCount != dict[id].objectCount) {
                return;
            }
            delete dict[id];
        }
    }

    this.logStat = function() {
        var count = 0;
        for (var k in dict) {
            if (dict.hasOwnProperty(k)) {
                ++count;
            }
        }
        console.log('pgParserNodeCatalogue - # objects: ' + count);
    }
}

var pgParserNodeCatalogueInstance = new pgParserNodeCatalogue();

/*
if(!window.global.pgGlobalParserNodeCatalogueInstance) {
    window.global.pgGlobalParserNodeCatalogueInstance = new pgParserNodeCatalogue();
} else {
    console.log("Using global pgParser Node Catalogue");
}
pgParserNodeCatalogueInstance = window.global.pgGlobalParserNodeCatalogueInstance;
*/

/*
 pgCreateNodeFromHtml creates pgParserNode from the source html

 LIMITATION: only one element with subelements can be created with one call to this function.

 Examples:
    var pgel = pgCreateNodeFromHtml('<p>Hi</p>'); //this will work

    var pgel = pgCreateNodeFromHtml('<p>Hi</p><p>Bye</p>'); //this will FAIL because two nodes are being created

    var pgel = pgCreateNodeFromHtml('<div><p>Hi</p><p>Bye</p></div>'); //will WORK because there is only one root element

To create more nodes simply call this function for each node:

    var pgel1 = pgCreateNodeFromHtml('<p>Hi</p>');
    var pgel2 = pgCreateNodeFromHtml('<p>Bye</p>');

    var pgdest = ... //element that will be replaced with pgel1 and pgel2
    pgdest.replaceWith(pgel1);
    pgel2.insertAfter(pgel2);

 */
var pgGetAttributesStringFilterOutPgIds = function(node, name, value, quote) {
    if(name == 'data-pg-id') return null;
    if(value === null) return name;
    return name + '=' + quote + value + quote;
}

var pgCreateNodeFromHtml = function(html) {
    //create node tree from html code
    var p = new pgParser();
    p.parse(html);
    catchDisplayBug(html);
    if(p.rootNode.children.length != 1) {
        throw new pgParserException("Create node from html failed. Only one node can be created.", html);
    }
    var node = p.rootNode.children[0];
    node.emitEvent("nodeCreated", {html: html});
    return p.rootNode.children[0];
}

var pgCreateDocumentNode = function(nodeCatalogue) {
    var rootNode = new pgParserNode;
    rootNode.tagName = 'document';
    rootNode.rootNode = true;
    rootNode.nodeCatalogue = nodeCatalogue ? nodeCatalogue : pgParserNodeCatalogueInstance;
    rootNode.document = rootNode;
    return rootNode;
}

var startsWithCaseInsensitive = function(token, source, position) {
    //return source.startsWith(token, i);
    var len = source.length;
    for(var n = 0; n < token.length; n++) {
        if((position + n >= len) || token.charAt(n) != source.charAt(position + n).toLowerCase()) return false;
    }
    return true;
}

var pgAttr = 'data-pg-id'

var pgParserNode = function(html) {

    this.tagName = null;
    this.tagNameOriginal = null;
    this.textNode = false;
    this.rootNode = false;
    this.attributes = '';
    this.closingTag = null;
    this.closed = false;
    this.selfClosed = false;
    this.content = null;
    this.singleTag = false;
    this.script = false;
    this.scriptClosed = false;
    this.children = [];
    this.parent = null;
    this.comment = false;
    this.isElement = false;
    this.pgId = null;
    this.hasPgIdAttr = false;
    this.objectCount = ++pgObjectCount;
    this.data = {};

    this.attrList = null;
    this.attrListChanged = false;

    this.nodeCatalogue = pgParserNodeCatalogueInstance;
    this.document = null;

    this.$el = null; //jQuery element

    this.startStringIndex = -1;
    this.endStringIndex = -1;

    var _this = this;
}

//pgParserNode methods
pgParserNode.prototype.setDocument = function(document) {
    this.walkSelfAndChildren(function(node) {
        node.document = document;
        return true;
    });
}

pgParserNode.prototype.getPage = function() {
    return typeof pinegrow != 'undefined' ? pinegrow.getCrsaPageOfPgParserNode(this) : null;
}



pgParserNode.prototype.getParent = function() {
    return this.parent;
}

pgParserNode.prototype.shouldHaveId = function() {
    if(this.script && (this.tagName == '?php' || this.tagName == '?=')) return true;
    return this.isElement && !this.script && !this.textNode && !this.comment;
}

pgParserNode.prototype.getByPgId = function(id) {
    var cat = this.nodeCatalogue ? this.nodeCatalogue : (this.document ? this.document.nodeCatalogue : null);
    if(cat) return cat.get(id);
    return null;
}

pgParserNode.prototype.walk = function(func) {
    for(var i = 0; i < this.children.length; i++) {
        var r = func(this.children[i]);
        if(!r) {
            return;
        } else if(r === 'skip_children') {
            continue;
        }
        this.children[i].walk(func);
    }
}

pgParserNode.prototype.walkSelfAndChildren = function(func) {
    if(!func(this)) return;
    this.walk(func);
}

pgParserNode.prototype.findOne = function(sel, stop_func) {
    var r = this.find(sel, true, false, stop_func);
    return r.length ? r[0] : null;
}

pgParserNode.prototype.find = function(sel, single, only_children, stop_func) {
    pgSelectorCache = {};
    var sel_list = sel.split(',');
    var results = [];
    for(var i = 0; i < sel_list.length; i++) {
        var path = sel_list[i].replace(/\s*\>\s*/g, ' >');
        path = path.split(' ');

        var _this = this;

        if(path.length == 1 && $.trim(path[0]) == 'self') {
            results.push(this);
        } else {
            this.walk(function(node) {
                if(stop_func) {
                    if(stop_func(node)) return 'skip_children';
                }
                if(node.isTo(path, _this)) {
                    if(results.indexOf(node) < 0) {
                        results.push(node);
                    }
                    if(single) return false;
                }

                return only_children ? 'skip_children' : true;
            });
        }
    }
    return results;
}

pgParserNode.prototype.findIncludingSelf = function(sel, single, stop_func) {
    if(single) {
        if(this.isSelector(sel)) return this;
        return this.findOne(sel, stop_func);
    } else {
        var r = this.find(sel, false, false, stop_func);
        if(this.isSelector(sel)) r.unshift(this);
        return r;
    }
}

pgParserNode.prototype.findOneWithAttrValue = function(attr, value) {
    var list = this.find('[' + attr + ']');
    for(var i = 0; i < list.length; i++) {
        if(list[i].getAttr(attr) == value) return list[i];
    }
    return null;
}

pgParserNode.prototype.findWithAttrValue = function(attr, value) {
    var r = [];
    var list = this.find('[' + attr + ']');
    for(var i = 0; i < list.length; i++) {
        if(list[i].getAttr(attr) == value) r.push( list[i]);
    }
    return r;
}

pgParserNode.prototype.validateTree = function() {
    var invalid = [];
    this.walkSelfAndChildren(function(node) {
        if(!node.validate()) invalid.push(node);
        return true;
    });
    return invalid;
}

var PG_CHAR_GREATER = '>'.charCodeAt(0);

pgParserNode.prototype.isTo = function(path, node) {
    var isChildOf = function (parent, current, selector) {
        var children = parent.children.filter(function(child) { return child.tagName != "text" });
        if(children.length == 0) return false;
        if (selector == "first-child") {
            if (children[0] != current) return false;
        }
        else if (selector == "last-child") {
            if (children[children.length - 1] != current) return false;
        }
        else {
            var match = selector.match(/nth-child\(([1-9]*)\)/);
            if (match) {
                var childIndex = parseInt(match[1]);
                if (childIndex > children.length) return false;
                else if (children[childIndex - 1] != current) return false;
            }
        }
        return true;
    }

    var getSepArray = function (sel) {
        var separatorArr = sel.split(':');
        if (separatorArr.length > 1) {
            return [true, separatorArr[0], separatorArr[1]];
        }
        else {
            return [false];
        }
    }

    var _this = this;
    var me = path[path.length-1];
    var immediate = false;
    if(me.charCodeAt(0) === PG_CHAR_GREATER) {
        immediate = true;
        me = me.substr(1);
    }
    var separatorArr = getSepArray(me);
    var selector;
    if (separatorArr[0]) {
        me = separatorArr[1];
        selector = separatorArr[2];
    }
    if(this.isSelector(me)) {
        if(path.length < 2) {
            if (selector) {
                if (!isChildOf(this.getParent(), this, selector)) return false;
            }
            return true;
        }
        var idx = path.length - 2;
        var parent = this.getParent();
        var current = this;
        while(parent && parent !== node) {
            var sel = path[idx];
            var next_immediate = false;
            if(sel.charCodeAt(0) === PG_CHAR_GREATER) {
                next_immediate = true;
                sel = sel.substr(1);
            }
            var pSepArray = getSepArray(sel);
            var pSelector;
            if (pSepArray[0]) {
                sel = pSepArray[1];
                pSelector = pSepArray[2];
            }
            if(parent.isSelector(sel)) {
                if (selector) {
                    if (!isChildOf(parent, this, selector)) return false;
                }
                idx--;
                if(idx <= 0) {
                    if (pSelector) {
                        current = parent;
                        parent = current.getParent();
                        if (!isChildOf(parent, current, pSelector)) return false;
                    }
                    return true;
                }
            } else {
                if(immediate) return false;
            }
            parent = parent.getParent();
            immediate = next_immediate;
            selector = undefined;
        }
        return false;
    } else {
        return false;
    }
}

pgParserNode.prototype.is = function (sel) {
    var sel_array = sel.split(',');

    for(var i=0; i<sel_array.length; i++) {
        var fixedEl = sel_array[i].trim();
        fixedEl = fixedEl.replace(/\s*\>\s*/g, ' >');
        var find_sel = fixedEl.split(' ');
        if (this.isTo(find_sel, this.document)) {
            return true;
        }
    }
    return false;
}

pgParserNode.prototype.parseSelector = function(sel) {
    var sel_orig = sel;
    if(!pgSelectorCache[sel_orig]) {
        var m = sel.match(/\[([^\]]+)\]/);
        var attr = null;
        if(m) {
            attr = m[1];
            sel = sel.replace(m[0],'');
        }

        pgSelectorCache[sel_orig] = {
            id: sel.match(/#[^\s\.]+/),
            tag: sel.match(/^[^\s\.#]+/),
            classes: sel.match(/\.[^\s\.#]+/g),
            attr: attr
        }
    }
    return pgSelectorCache[sel_orig];
}

pgParserNode.prototype.isSelector = function(sel, parsed_sel) {
    parsed_sel = parsed_sel || this.parseSelector(sel);

    if(parsed_sel.id) {
        if(this.getElementId() != parsed_sel.id[0].replace('#','')) return false;
    }
    if(parsed_sel.tag) {
        if (parsed_sel.tag.length > 0 && parsed_sel.tag[0] != '*') {
            if(parsed_sel.tag != this.tagName) return false;
        }
    }
    if(parsed_sel.classes) {
        for(var i = 0; i < parsed_sel.classes.length; i++) {
            if(!this.hasClass(parsed_sel.classes[i].replace('.', ''))) return false;
        }
    }
    if(parsed_sel.attr) {
        var attrArr = parsed_sel.attr.split('=');
        if(this.hasAttr(attrArr[0])) {
            if (attrArr.length > 1) {
                var attrValue = attrArr[1].replace(/(\"|\')/g, '');
                if (this.attr(attrArr[0]) != attrValue) return false;
            }
        }
        else {
            return false;
        }
    }
    return true;
}

pgParserNode.prototype.closest = function(sel) {
    var parsed_sel = this.parseSelector(sel);
    var r = this;
    while(!r.isSelector(sel, parsed_sel)) {
        if(!r.parent) return null;
        r = r.parent;
    }
    return r;
}


//Methods with operations
pgParserNode.prototype.addChild = function(node) {

    this.withEmitEvent(function() {
        this.children.push(node);
        node.parent = this;
        node.setDocument(this.document);
    }, 'addChild', node)

    //this.emitEvent('addChild', node);
    /*
    var o = this.makeOperation('addChild', node,
        function(o) { //undo
            o.getElement().removeChild(o.getObject());
        },
        function(o) { //redo
            o.getElement().addChild(o.getObject());
        }
    );
    */
}

pgParserNode.prototype.removeChild = function(node) {

    this.withEmitEvent(function() {
        var idx = this.getChildPos(node);
        if(idx >= 0) {
            this.children.splice(idx, 1);
        }
        node.parent = null;
        node.setDocument(null);

    }, 'removeChild', node);

    /*
    var o = this.makeOperation('removeChild', node,
        function(o) { //undo
            o.getElement().addChild(o.getObject());
        },
        function(o) { //redo
            o.getElement().removeChild(o.getObject());
        }
    );
    */
}

pgParserNode.prototype.replaceTag = function(tag) {

    /*
    var o = this.makeOperation('replaceTag', {tag: tag, currentTag: this.tagName, currentTagOriginal: this.tagNameOriginal, currentClosingTag: this.closingTag},
        function(o) { //undo
            var pgel = o.getElement();
            pgel.tagName = o.data.currentTag;
            pgel.tagNameOriginal = o.data.currentTagOriginal;
            pgel.closingTag = o.data.currentClosingTag;
        },
        function(o) { //redo
            o.getElement().replaceTag(o.data.tag);
        }
    );
    */
    this.withEmitEvent(function() {
        this.tagName = tag;
        this.tagNameOriginal = tag;
        if(this.closingTag) {
            this.closingTag = tag;
        }

    }, 'replaceTag', {tag: tag});

    return this;
}

pgParserNode.prototype.replaceWith = function(node, detach) {
    if(!this.parent) return this; //nothing to do

    this.withEmitEvent(function() {
        node.insertBefore(this);
        if(detach) {
            this.detach();
        } else {
            this.remove();
        }
    }, 'replaceWith', node, {detach: detach});

    return this;
}

pgParserNode.prototype.replaceContentWithContentOf = function(node, detach) {
    this.withEmitEvent(function() {
        while(this.children.length) {
            if(detach) {
                this.children[0].detach();
            } else {
                this.children[0].remove();
            }
        }
        while(node.children.length) {
            this.append(node.children[0]);
        }

    }, 'replaceContentWithContentOf', node, {detach: detach});
}

pgParserNode.prototype.replaceContentWithElement = function(node, detach) {
    this.withEmitEvent(function() {
        while(this.children.length) {
            if(detach) {
                this.children[0].detach();
            } else {
                this.children[0].remove();
            }
        }
        this.append(node);
    }, 'replaceContentWithElement', node, {detach: detach});
}

pgParserNode.prototype.detag = function() {
    this.withEmitEvent(function() {
        if(this.parent) {
            while(this.children.length) {
                this.children[0].insertBefore(this);
            }
            this.remove();
        }
    }, 'detag');
}

pgParserNode.prototype.clone = function(dont_asign_id, copy_ids) {
    var node = new pgParserNode();
    node.tagName = this.tagName;
    node.textNode = this.textNode;
    node.rootNode = this.rootNode;
    node.attributes = this.getAttributesString();
    node.closingTag = this.closingTag;
    node.selfClosed = this.selfClosed;
    node.content = this.content;
    node.singleTag = this.singleTag;
    node.script = this.script;
    node.scriptClosed = this.scriptClosed;
    node.comment = this.comment;
    node.document = this.document;
    node.nodeCatalogue = this.nodeCatalogue || pgParserNodeCatalogueInstance;
    node.isElement = this.isElement;

    node.attrList = null;
    node.hasPgIdAttr = this.hasPgIdAttr;
    node.data = this.data;

    if(!dont_asign_id && node.shouldHaveId()) {
        node.assignId();
        node.nodeCatalogue.add(node);
    }
    if(copy_ids) {
        node.pgId = this.getId();
    }

    for(var n = 0; n < this.children.length; n++) {
        node.addChild(this.children[n].clone(dont_asign_id, copy_ids));
    }
    return node;
}

pgParserNode.prototype.setData = function(key, value) {
    this.data[key] = value;
}

pgParserNode.prototype.getData = function(key, default_value) {
    return this.data[key] || default_value || null;
}

pgParserNode.prototype.removeAllChildren = function() {
    this.withEmitEvent(function() {
        while(this.children.length) {
            this.children[0].remove();
        }

    }, 'removeAllChildren');
}

pgParserNode.prototype.html = function(html, withIds, formatOptions) {
    if(typeof html == 'undefined' || html === null) {
        if(this.script || this.textNode) return this.content;
        if(this.tagName == 'script' || this.tagName == 'php') return this.content;

        var s = '';
        for(var i = 0; i < this.children.length; i++) {
            s += this.children[i].toString('', true, withIds, null, formatOptions ? true : false, formatOptions);
        }
        return s;
    }
    if(this.script) {
        this.content = html;
    } else if(this.tagName == 'script' || this.tagName == 'php' || this.textNode) {
        this.content = html;
    } else {
        this.withEmitEvent(function() {
            var p = new pgParser();
            p.parse(html);
            while (this.children.length) {
                this.children[0].remove();
            }
            for (var i = 0; i < p.rootNode.children.length; i++) {
                this.addChild(p.rootNode.children[i]);
            }
            catchDisplayBug(html);
        },'html', {html: html});
    }

    return this;
}

pgParserNode.prototype.text = function(html) {
    if(typeof html == 'undefined' || html === null) {
        var s = '';
        for(var i = 0; i < this.children.length; i++) {
            if(this.children[i].tagName == 'text') {
                s += this.children[i].toString('', true, false);
            } else {
                s += this.children[i].text();
            }
        }
        return s;
    }
    this.html(html); //will emit events
}

pgParserNode.prototype.indentText = function(text, indent, level, html_options) {
    if(indent === null) {
        if (!html_options) html_options = pinegrow.getFormatHtmlOptions();
        if (level === null) level = this.getNestingLevel();
        indent = pinegrow.getHtmlIndentForLevel(level, html_options);
    }

    var lines = text.split("\n");
    var s = '';

    for(var i = 0; i < lines.length; i++) {
        if(i > 0) s += '\n';
        s += (i == 0) ? lines[i] : indent + lines[i];
    }
    return s;
}



pgParserNode.prototype.isDescendantOf = function(ancestor) {
    var p = this.parent;
    while(p != null) {
        if(p == ancestor) {
            return true;
        }
        p = p.parent;
    }
    return false;
}

pgParserNode.prototype.getChildPos = function(child, skip_text) {
    if(!skip_text) return this.children.indexOf(child);
    var idx = -1;
    for(var i = 0; i < this.children.length; i++) {
        if(this.children[i].isElement) {
            idx++;
            if(this.children[i] == child) return idx;
        }
    }
    return -1;
}

pgParserNode.prototype.getChildAtPos = function(pos, skip_text) {
    var idx = -1;
    for(var i = 0; i < this.children.length; i++) {
        if(!skip_text || this.children[i].isElement) {
            idx++;
        }
        if(idx == pos) return this.children[i];
    }
    return null;
}

pgParserNode.prototype.next = function(include_text) {
    var idx = this.parent.getChildPos(this) + 1;
    var next = null;
    while(idx < this.parent.children.length && !next) {
        if(this.parent.children[idx].isElement || include_text) {
            next = this.parent.children[idx];
            break;
        }
        idx++;
    }
    return next;
}

pgParserNode.prototype.prev = function(include_text) {
    var idx = this.parent.getChildPos(this) - 1;
    var prev = null;
    while(idx >= 0 && !prev) {
        if(this.parent.children[idx].isElement || include_text) {
            prev = this.parent.children[idx];
            break;
        }
        idx--;
    }
    return prev;
}

pgParserNode.prototype.first = function(include_text) {
    var idx = 0;
    while(idx < this.children.length) {
        if(this.children[idx].isElement || include_text) {
            return this.children[idx];
            break;
        }
        idx++;
    }
    return null;
}

pgParserNode.prototype.insertAtIndex = function(parent, idx, skip_text) {
    this.withEmitEvent(function() {
        if(parent == this.parent) {
            var i = this.parent.children.indexOf(this);
            if(i < idx) idx--;
        }
        this.detach();

        if(skip_text && idx > 0) {
            var num_non_text = 0;
            var nidx = idx;
            for(var i = 0; i < parent.children.length; i++) {
                if(!parent.children[i].shouldHaveId()) {
                    nidx++;
                } else {
                    num_non_text++;
                    if(idx == num_non_text) break;
                }
            }
            idx = nidx;
        }
        if(idx >= parent.children.length) {
            parent.children.push(this);
        } else {
            parent.children.splice(idx, 0, this);
        }
        this.parent = parent;
        this.setDocument(this.parent.document);

    }, 'insertAtIndex', parent, {index: idx, skip_text: skip_text});

    return this;
}

pgParserNode.prototype.insert = function(dest, before) {
    if(!dest.parent) return;//throw new pgParserException("Object has no parent", dest);
    var idx = dest.parent.getChildPos(dest);
    if(idx < 0) {
        throw new pgParserException("Node is not in parent child list", dest);
    } else {
        this.withEmitEvent(function() {
            if(before) {
                this.insertAtIndex(dest.parent, idx);
            } else {
                this.insertAtIndex(dest.parent, idx+1);
                /*
                var next = dest.next();
                if(!next) {
                    dest.parent.append(this);
                } else {
                    idx = dest.parent.getChildPos(next);
                    this.insertAtIndex(dest.parent, idx);
                }*/
            }
        }, 'insert', dest, {before: before});
    }

    return this;
}

pgParserNode.prototype.detach = function() {
    this.withEmitEvent(function() {
        if(this.parent) {
            this.parent.removeChild(this);
        }
    }, 'detach');
}

pgParserNode.prototype.remove = function() {
    this.withEmitEvent(function() {
        this.detach();
        if(this.nodeCatalogue) this.nodeCatalogue.remove(this);
        while(this.children.length) {
            this.children[0].remove();
        }
    }, 'remove');
}

pgParserNode.prototype.insertBefore = function(dest) {
    this.withEmitEvent(function() {
        this.insert(dest, true);
    }, 'insertBefore', dest);
    return this;
}

pgParserNode.prototype.insertAfter = function(dest) {
    this.withEmitEvent(function() {
        this.insert(dest, false);
    }, 'insertAfter', dest);
    return this;
}

pgParserNode.prototype.appendPrepend = function(dest, prepend) {
    this.withEmitEvent(function() {
        this.detach();
        if(prepend) {
            dest.children.unshift(this);
        } else {
            dest.children.push(this);
        }
        this.parent = dest;
        this.setDocument(this.parent.document);
    }, 'appendPrepend', dest, {prepend: prepend});

    return this;
}

pgParserNode.prototype.appendTo = function(dest) {
    return this.appendPrepend(dest, false); //will emit event
}

pgParserNode.prototype.prependTo = function(dest) {
    return this.appendPrepend(dest, true); //will emit event
}

pgParserNode.prototype.append = function(node) {
    node.appendTo(this); //will emit event
}

pgParserNode.prototype.prepend = function(node) {
    node.prependTo(this); //will emit event
}

pgParserNode.prototype.getClasses = function() {
    var classes = this.getAttr('class');
    if(classes) {
        return classes.split(' ');
    }
    return [];
}

pgParserNode.prototype.hasClass = function(cls) {
    var list = this.getClasses();
    var idx = list.indexOf(cls);
    if(idx >= 0) return true;
    return false;
}

pgParserNode.prototype.addClass = function(cls) {
    var list = this.getClasses();
    var idx = list.indexOf(cls);
    if(idx < 0) {
        list.push(cls);
        this.setAttr('class', list.join(' '));
    }

    //this.emitEvent('addClass', {class: cls});
}

pgParserNode.prototype.removeClass = function(cls) {
    var list = this.getClasses();
    var r = [];
    for(var i = 0; i < list.length; i++) {
        if(list[i] != cls) {
            r.push(list[i]);
        }
    }
    if(r.length) {
        this.setAttr('class', r.join(' '));
    } else {
        this.removeAttr('class');
    }
    //this.emitEvent('removeClass', {class: cls});
}

pgParserNode.prototype.canAddClass = function(cls) {
    return true;
}

pgParserNode.prototype.canRemoveClass = function(cls) {
    //if source node doesn't have this class then we can't remove it as it was added dynamically
    return this.hasClass(cls);
}

//console.log(_this.attributes);

var attrscripts = [['<?php', '?>'], ['<?=', '?>']];

var indexOfCodeAware = function(str, what, from) {
    //return str.indexOf(what, from);
    var scripts = attrscripts;
    var len = str.length;
    var idx = -1;
    var n = from || 0;
    while(n < len) {
        var ch = str.charAt(n);
        if(ch === '<') {
            for(var si = 0; si < scripts.length; si++) {
                if(startsWithCaseInsensitive(scripts[si][0], str, n)) {
                    //script starts
                    var end_idx = str.indexOf(scripts[si][1], n + scripts[si][0].length);
                    if(end_idx < 0) {
                        return idx;
                    }
                    //found end
                    n = end_idx + scripts[si][1].length;
                }
            }
        }
        if(str.startsWith(what, n)) {
            return n;
        }
        n++;
    }
    return idx;
}



pgParserNode.prototype.getAttrList = function() {
    if(this.attrList) return this.attrList;

    var _this = this;

    this.attrList = [];
    this.attrListChanged = false;

    if(this.script || this.comment || !this.attributes || this.attributes.length == 0) return this.attrList;

    var i = 0;
    var in_name = true;
    var in_value = false;
    var cur_name = '';
    var cur_value = '';
    var in_quote = null;

    var attrReadUntil = function(end_ch, ignore) {
        //var idx = _this.attributes.indexOf(end_ch, i);

        var idx = scripts_possible ? indexOfCodeAware(_this.attributes, end_ch, i) : _this.attributes.indexOf(end_ch, i);

        do {
            if(idx < 0) {
                i = _this.attributes.length;
                return null;
            } else {
                /*
                if(ignore) {
                    var ign_idx = _this.attributes.indexOf(ignore, i);
                    if(ign_idx >= 0 && idx >= ign_idx && idx + end_ch.length <= ign_idx + ignore.length) {
                        i = idx + end_ch.length;
                        continue;
                    }
                }
                */
                var s = _this.attributes.substr(i, idx - i);
                i = idx + end_ch.length;
                return s;
            }
        }
        while(i < _this.attributes.length);
        return '';
    }

    var scripts_possible = this.attributes.indexOf('<') >= 0;

    while(i < this.attributes.length) {
        var ch = this.attributes.charAt(i);
        if(ch == ' ' || ch == "\t" || ch == "\n" || ch == "\r" || ch == '/' || ch == '>' || ch == '=') {
            //space
            if(cur_name.length > 0) {
                //name done

                var has_equal = false;
                if(i < this.attributes.length - 1) {
                    while(i < this.attributes.length && (ch == ' ' || ch == '=')) {
                        if(ch == '=') has_equal = true;
                        i++;
                        ch = this.attributes.charAt(i);
                    }

                }

                if(has_equal) {
                    var which_quote = "\"";

                    in_value = true;
                    if(ch == '"' || ch == '\'') {
                        in_quote = ch;
                        which_quote = ch;
                    } else {
                        in_quote = null;
                    }
                    var val = '';
                    if(in_quote) {
                        i++;
                        val = attrReadUntil(in_quote); //disable escaping quotes, '\\' + in_quote);
                    } else {

                        if(i < this.attributes.length - 1) {
                            do {
                                val += ch;
                                i++;
                                ch = this.attributes.charAt(i);
                            }
                            while(i < this.attributes.length && (ch != ' ' && ch != '>' && ch != '/'));
                        }
                    }
                    this.attrList.push({name: cur_name, value: val, quote: which_quote});
                } else {
                    i--;
                    this.attrList.push({name: cur_name, value: null});
                }
                cur_name = '';
            }
        } else {
            //nonspace
            cur_name += ch.toLowerCase();

            if(cur_name === '<?php' || cur_name === '<?=') {
                i++;
                var r = attrReadUntil('?>');
                cur_name +=  r + '?>';
                if(r.length) i--;
            }
        }
        i++;
    }
    if(cur_name.length) {
        this.attrList.push({name: cur_name, value: null});
    }
    //console.log(this.attrList);
    return this.attrList;
   // console.log(this.attrList);
}


pgParserNode.prototype.hasAttr = function(attr) {
    var list = this.getAttrList();
    if(!list) return null;
    var r = this.findAttrsInList(attr, list);
    if(r.length) {
        return true;
    } else {
        return false;
    }
}

pgParserNode.prototype.attr = function(attr) {
    return this.getAttr(attr);
}

pgParserNode.prototype.findAttributesStartingWith = function(attr) {
    var list = this.getAttrList();
    if(!list) return [];
    var r = [];
    for(var i = 0; i < list.length; i++) {
        if(list[i].name.indexOf(attr) == 0) {
            r.push(list[i]);
        }
    }
    return r;
}

pgParserNode.prototype.findAttrsInList = function(attr, list) {
    var r = [];
    attr = attr.toLowerCase();
    for(var i = 0; i < list.length; i++) {
        if(attr == list[i].name) {
            r.push(list[i]);
        }
    }
    return r;
}

pgParserNode.prototype.setAttr = function(attr, value, skip_encode) {
    this.withEmitEvent(function() {
        if(typeof value == 'undefined') value = null;
        var list = this.getAttrList();
        var r = this.findAttrsInList(attr, list);
        if(r.length) {
            var quote = r[r.length-1].quote || '"';
            if(!skip_encode && quote == '"') value = pgEncodeAttribute(value);
            r[r.length-1].value = value;
        } else {
            if(!skip_encode) value = pgEncodeAttribute(value);
            list.push({name: attr, value: value});
        }
        this.attrListChanged = true;
        catchDisplayBug(value);

    }, 'setAttr', {attr: attr, value: value});

    return value;
}

pgParserNode.prototype.getAttr = function(attr) {
    var list = this.getAttrList();
    if(!list) return null;
    var r = this.findAttrsInList(attr, list);
    if(r.length) {
        var quote = r[r.length-1].quote || '"';
        if(quote == '"') {
            return pgDecodeAttribute( r[r.length-1].value );
        } else {
            return r[r.length-1].value;
        }
    } else {
        return null;
    }
}

pgParserNode.prototype.removeAttr = function(attr) {
    this.withEmitEvent(function() {
        var list = this.getAttrList();
        attr = attr.toLowerCase();
        this.attrList = [];
        for(var i = 0; i < list.length; i++) {
            if(list[i].name != attr) {
                this.attrList.push(list[i]);
            }
        }
        if(list.length != this.attrList.length) {
            this.attrListChanged = true;
        }

    }, 'removeAttr', {attr: attr});
}

pgParserNode.prototype.removeAttrIfStartsWith = function(str, in_children, in_subcall) {

    if(!this.isElement) return true;

    var strs = typeof str === 'string' ? [str] : str;
    var first_found = -1;

    var has_hits = false;

    if(!this.attrListChanged) {
        if(this.attributes.length) {
            for(var j = 0; j < strs.length; j++) {
                if(this.attributes.indexOf(strs[j]) >= 0) {
                    has_hits = true;
                    break;
                }
            }
        }
    } else if(this.getAttrList().length) {
        has_hits = true; //search the list
    }
    if(has_hits) {
        var list = this.getAttrList();

        for(var i = 0; i < list.length; i++) {
            for(var j = 0; j < strs.length; j++) {
                if(list[i].name.startsWith(strs[j])) {
                    first_found = i;
                    break;
                }
            }
            if(first_found >= 0) break;
        }
        if(first_found >= 0) {
            this.attrList.splice(first_found, 1);

            for(var i = first_found; i < this.attrList.length; i++) {
                for(var j = 0; j < strs.length; j++) {
                    if(list[i].name.startsWith(strs[j])) {
                        this.attrList.splice(i, 1);
                        i--;
                        break;
                    }
                }
            }
            this.attrListChanged = true;
        }
    }
    if(in_children) {
        this.walk( function(node) {
            node.removeAttrIfStartsWith(str, true, true);
            return true;
        })
    }
    if(!in_subcall) {
        this.emitEvent('removeAttrIfStartsWith', {starts_with: str, in_children: in_children});
    }

//}}}}}}}}}

};

pgParserNode.prototype.removePinegrowAttributes = function() {
    this.removeAttrIfStartsWith('data-pg-');
}

pgParserNode.prototype.getAttributesString = function(filter_func) {
    if(!this.attrListChanged && !filter_func) {
        return this.attributes;
    }
    var o = [];
    var list = this.getAttrList();
    if(filter_func) {
        for(var i = 0; i < list.length; i++) {
            var str = filter_func(this, list[i].name, list[i].value, list[i].quote || '"');
            if(str && str.length) {
                o.push(str);
            }
        }
    } else {
        for(var i = 0; i < list.length; i++) {
            if(list[i].value === null) {
                o.push(list[i].name);
            } else {
                var quote = list[i].quote || '"';
                o.push(list[i].name + '=' + quote + list[i].value + quote);
            }
        }
    }
    return o.length > 0 ? ' ' + o.join(' ') : '';
}

pgParserNode.prototype.getElementId = function() {
    return this.getAttr('id');
}


pgParserNode.prototype.getId = function() {
    if(this.pgId === null && this.attributes) {
        var m = this.attributes.match(pgIdRegExp);
        if(m) {
            this.pgId = m[1];
            this.hasPgIdAttr = true;
        } else {
            this.pgId = 0;
            this.hasPgIdAttr = false;
        }
    }
    return this.pgId !== 0 ? this.pgId : null;
}

pgParserNode.prototype.assignId = function(prefix) {
    if(this.hasPgIdAttr) {
        this.attributes = this.attributes.replace(pgIdRegExpReplace, '');
        this.hasPgIdAttr = false;
    }
    this.pgId = prefix ? prefix + '_' + (++pgIdCount) : ++pgIdCount;
    return this.pgId;
}

pgParserNode.prototype.getOrAssignId = function() {
    var id = this.getId();
    if(!id) id = this.assignId();
    return id;
}

pgParserNode.prototype.assignIdAndAddToCatalog = function(do_subnodes) {
    var _this = this;
    if(do_subnodes) {
        this.walkSelfAndChildren(function(node) {
            if(node.shouldHaveId()) {
                var id = node.getOrAssignId();
                _this.nodeCatalogue.add(node);
            }
            return true;
        })
    } else {
        if(this.shouldHaveId()) {
            var id = this.assignId();
            _this.nodeCatalogue.add(this);
        }
    }
}

pgParserNode.prototype.get$DOMElement = function($html) {
    if(this.$el) return this.$el;
    if(!$html) {
        var page = pinegrow.getCrsaPageOfPgParserNode(this);
        if(page) {
            $html = page.get$Html();
        }
    }
    return $html ? $html.find('[data-pg-id="' + this.getId() + '"]') : null;
}

pgParserNode.prototype.mapIdsToDomElement = function(node) {
    var id = this.getId();
    if(id) {
        node.setAttribute("data-pg-id", id);
    }
    var dom_i = 0;
    var pg_i = 0;

    if(node.hasChildNodes()) {
        for(var i = 0; i < this.children.length; i++) {
            if(!this.children[i].shouldHaveId()) continue;

            while(dom_i < node.childNodes.length && node.childNodes[dom_i].nodeType != 1) {
                dom_i++;
            }
            if(dom_i < node.childNodes.length) {
                this.children[i].mapIdsToDomElement(node.childNodes[dom_i]);
            }
            dom_i++;
        }
    }
}

pgParserNode.prototype.validate = function() {
    if(!this.rootNode && this.tagName != 'text' && (!(this.closed || pgAutoClosedTags[this.tagName]) || (this.closingTag && this.tagName != this.closingTag.toLowerCase()))) {
        return false;
    }
    return true;
}

pgParserNode.prototype.getNestingLevel = function() {
    var level = 0;
    var n = this;
    while(n.parent) {
        level++;
        n = n.parent;
    }
    return level;
}

pgParserNode.prototype.getOpeningTag = function() {
    if(this.isElement) {
        return '<' + this.tagName + '' + this.getAttributesString(pgGetAttributesStringFilterOutPgIds) + '>';
    }
    return null;
}

pgParserNode.prototype.getClosingTag = function() {
    if(this.isElement) {
        return '</' + (this.closingTag ? this.closingTag : this.tagName) + '>';
    }
    return null;
}

pgParserNode.prototype.findChildNodeAtSourceIndex = function(index) {
    for(var i = 0; i < this.children.length; i++) {
        if(index >= this.children[i].startStringIndex && (i == this.children.length - 1 || index < this.children[i+1].startStringIndex)) return this.children[i];
    }
    return null;
}

pgParserNode.prototype.findNodeAtSourceIndex = function(index) {
    var node = this.findChildNodeAtSourceIndex(index);
    if(node) {
        var child = node.findChildNodeAtSourceIndex(index);
        while(child && !child.textNode) {
            node = child;
            child = node.findChildNodeAtSourceIndex(index);
        }
    }
    return node;
}

pgParserNode.prototype.getPath = function() {
    var p = this;
    var path = '';
    while(p.parent) {
        path = p.parent.getChildPos(p, true) + (path.length ? ',' : '') + path;
        p = p.parent;
    }
    return path;
}

pgParserNode.prototype.getNodeFromPath = function(path, return_last_valid) {
    var a = path.split(',');
    var node = this;
    for(var i = 0; i < a.length; i++) {
        node = node.getChildAtPos(parseInt(a[i]), true);
        if(!node) return return_last_valid ? node : null;
    }
    return node;
}

pgParserNode.prototype.getPositionInSource = function() {
    var pos = {start: this.startStringIndex, end: -1};
    var next = this.next(true);
    if(next) {
        pos.end = next.startStringIndex;
    } else if(this.parent) {
        pos.end = this.parent.getPositionInSource().end;
        var ct = this.parent.getClosingTag();
        if(ct) pos.end -= ct.length;
    }
    return pos;
}

pgParserNode.prototype.getScriptIndent = function() {
    if(!this.script || !this.content) return 0;
    //  1 - indent next line
    //  -1 - indent back this line
    // -2 - indent back this, indent next
    // 0
    if(this.content.match(/^\s(if|while)/) && this.content.indexOf(':') > 0) {
        return 1;
    } else if(this.content.match(/^\s(endif|endwhile)/)) {
        return -1;
    } else if(this.content.match(/^\selse/)) {
        return -2;
    } else {
        //count { and }
        var open_c = 0;
        var close_c = 0;
        for(var i = 0; i < this.content.length; i++) {
            var ch = this.content.charCodeAt(i);
            if(ch === 123) {
                open_c++;
            } else if(ch === 125) {
                close_c++;
            }
        }
        if(open_c === close_c) {
            return 0;
        } else if(open_c > close_c) {
            return 1;
        } else {
            return -1;
        }
    }

    return 0;
}

pgParserNode.prototype.changeToPhp = function(code) {
    this.tagName = "?php";
    this.tagNameOriginal = "?php";
    this.script = true;
    this.isElement = false;
    this.textNode = false;
    this.singleTag = true;
    this.closed = true;
    this.scriptClosed = true;
    this.closingTag = null;
    this.content = code;
    this.selfClosed = false;
}



pgParserNode.prototype.toString = function(pref, showTextNodes, withIds, func, format_html, options, use_pref, only_content) {
    pref = pref || '';

    //pref = '';
    if(!options) {
        options = {
            indent: '    ',
            php_ids: false,
            assign_missing_ids: true
        }
    }

    if(typeof use_pref == 'undefined') use_pref = true;

    var nl = ''
    var enl = '';
    var epref = pref;

    var s = '';

    var pgId = null;
    var pgIdAdd = '';
    var pgIdPrepend = '';

    var assign_missing_ids = 'assign_missing_ids' in options ? options.assign_missing_ids : true;
    var indent = options.indent;

    this.attrListChanged = this.isElement; //force attr parsing to eliminate empty spaces etc
    if(this.attrListChanged) {
        this.attributes = this.getAttributesString(function(node, name, value, quote) {
            if(!withIds && name == 'data-pg-id') return null;
            var str;
            if(value === null) {
                str = name;
            } else {
                str = name + '=' + quote + value + quote;
            }
            if(func) {
                str = func(node, str, 'attribute', name, value, quote);
            }
            return str;
            //withIds ? null : pgGetAttributesStringFilterOutPgIds
        });
        this.attrListChanged = false;
    }

    //this.attributes = this.getAttributesString(pgGetAttributesStringFilterOutPgIds);

    var attrs = this.attributes;

    if(this.script) {
        attrs = this.indent_text ? pgReindentText(this.content, pref + indent, pref) : this.content;
    }

    pgId = this.getId();

    var format = format_html && pgDontFormat.indexOf(this.tagName) < 0 && !this.selfClosed;

    if(format && (pgDontFormatIfAllChildrenNonFormat.indexOf(this.tagName) >= 0 || pgSingleTags.indexOf(this.tagName) >= 0)) {
        format = false;
        for(var i = 0; i < this.children.length; i++) {
            if(!this.children[i].textNode && pgDontFormat.indexOf(this.children[i].tagName) < 0) {
                format = true;
                break;
            }
        }
    }

    options.last_format = format;

    var orig_pref = pref;

    /*
    if(pref.length > 80) {
        pref = pref;
        console.log('too deep');
        return '';
    }
*/
    //console.log(this);
    var php_ids = options.php_ids || false;

    if(format) {
        nl = "\n";
        enl = '\n';
    } else {
        //pref = '';
    }
    if(pref.length) enl = '\n';

    if(this.rootNode) {
        indent = '';
    }

    if(pgId) {
        if(!withIds) {
            attrs = attrs.replace(pgIdRegExp, '');
        } else {
            if(!this.hasPgIdAttr) {
                pgIdAdd = ' ' + pgAttr + '="' + pgId + '"';
            }
        }
    }
    if(pgId === null && withIds && this.isElement && assign_missing_ids) {
        pgId = this.assignId();
        pgIdAdd = ' ' + pgAttr + '="' + pgId + '"';
    }
    if(pgIdAdd && (this.tagName == '?php' || this.tagName == '?=')) {
        if(php_ids) pgIdPrepend = ' /*' + pgIdAdd + '*/';
        pgIdAdd = '';
    }

    if(showTextNodes && this.textNode) {
        //if(this.content == "\n") return this.content;
        if(format && this.content.match(pgWhiteSpaceRegExp)) {
 //           if(this.content.indexOf("\n") >= 0) return '\n';
            if(this.content.indexOf("\n") >= 0) return '';
            if(this.content.length) return ' ';
            return '';
        }
        return this.content;
    }

    var content = '';
    var just_text_or_empty = true;
    var prev_is_formatted = false;

    for(var i = 0; i < this.children.length; i++) {
        if(!showTextNodes && this.children[i].textNode) continue;
        just_text_or_empty = just_text_or_empty && this.children[i].textNode;

        var script_indent = this.children[i].getScriptIndent();

        if(script_indent == -1 || script_indent == -2) {
            pref = pref.substr(0, pref.length - options.indent.length);
        }
        var c = this.children[i].toString(pref + indent , showTextNodes, withIds, func, format_html, options, format);
        var child_format = options.last_format;
        var is_text = this.children[i].textNode;

        if(withIds && this.children[i].tagName == '?php' && php_ids) {
            var cpgId = this.children[i].getId();
            c = pref + indent + '<!--[start-pg-id:' + cpgId + ']-->\n' + c + '\n' + pref + indent + '<!--[end-pg-id:' + cpgId + ']-->';
        }
        if(script_indent == 1 || script_indent == -2) {
            pref = pref + options.indent;
        }

        if(format) {
            if(c.length) {

                if(is_text) {
                    if(c.length) {
                        var br = '';
                        if(c.charAt(0) == "\n") {
                            c = c.replace(/^\n\s*/,"");
                            prev_is_formatted = true;
                            br = "\n";
                        }
                        if(prev_is_formatted) {
                            c = br + pref + indent + c;
                            if(i + 1 < this.children.length) {
                                if(!this.children[i+1].textNode) c = c + "\n";
                            } else {
                                c = c + "\n";
                            }
                        }
                    }
                } else {
                    if(!this.rootNode || content.length) {
                        c = "\n" + c;
                    }
                }
                prev_is_formatted = child_format;
            } else {
                if(i + 1 == this.children.length) {
                    //last one
                    c = "\n" + c;
                }
            }

        }
        content += c;

    }
    if(format && this.children.length && !just_text_or_empty && content.length && !this.rootNode) {
        if(content.charAt(content.length-1) != "\n") {
            content = content + "\n";
        }
    }

    if(only_content) return content;

    if(format && just_text_or_empty) {
        nl = '';
        epref = '';
    }
    enl = '';

    options.last_format = format;

    if(attrs.length && func) {
        attrs = func(this, attrs, 'attrs');
    }

    if(!this.rootNode) {
        s += (use_pref ? pref : "") + '<' + (this.tagNameOriginal ? this.tagNameOriginal : this.tagName) + pgIdPrepend + attrs + pgIdAdd + (this.selfClosed ? ' /' : '');
        if(this.script) {
            if(this.tagName == '?php' || this.tagName == '?=') {
                if(this.scriptClosed) {
                    s += '?>';
                }
            } else {
                s += '>';
            }
        } else {
            s += '>';
        }
    } else {
        return s + content;
    }

    if(this.content && !this.script) {
        if(this.tagName == 'php') {
            content += pgReindentText(this.content, pref);// + indent);
        } else {
            content += this.content;
        }
    }
    if(func) content = func(this, content, 'content');

    if(format) {
        s += content;
    } else {
        s += content;
    }

    if(!this.singleTag) {
        if(this.closingTag) {
            s += (format ? epref : '') + '</' + this.closingTag + '>' + enl;
        } else {
            s += enl;
        }
    } else {
        s += enl;
    }
    if(func) s = func(this, s, 'node');
    return s;
}

pgParserNode.prototype.toStringOriginal = function(format_html, options, func, only_content) {
    return this.toString(null, true, false, func, format_html, options, null, only_content)
}

pgParserNode.prototype.toStringWithIds = function(format_html, options, func, only_content) {
    return this.toString(null, true, true, func, format_html, options, null, only_content)
}

pgParserNode.prototype.toStringContent = function(format_html, options) {
    var html = this.toStringOriginal(format_html, options, null, true);
    html = pgReindentText(html);
    html = $.trim(html);
    return html;
}

pgParserNode.prototype.toDebug = function() {
    var s = '';

    if(this.textNode) {
        s = '[TEXT] |' + this.content + '|';
    } else if(!this.rootNode) {
        s = (this.tagNameOriginal ? this.tagNameOriginal : this.tagName);
        if(this.closed) s += ' /' + this.closingTag;
    }

    if(this.children.length) {
        s += '<ul>';
        for(var i = 0; i < this.children.length; i++) {
            s += this.children[i].toDebug();
        }
        s += '</ul>';
    }
    if(this.rootNode) return s;

    return '<li>' + s + '</li>';
}

pgParserNode.prototype.getName = function(html) {
    if(this.isElement) {
	    var r = '';
	    r += '<nametag>' + this.tagName + '</nametag>';
	    if(this.getAttr('id')) {
		    r += '<nameid>#' + this.getAttr('id') + '</nameid>';
	    }
	    var classes = this.getClasses();
	    for(var i = 0; i < classes.length; i++) {
		    r += '<nameclass>.' + classes[i] + '</nameclass>';
		    if(i == 1 && classes.length > 2) {
			    r += '<nameclass>...</nameclass>';
			    break;
		    }
	    }
	    var t = $.trim(this.text().replace(/\n/g, ' '));
	    if(t.length) {
		    if(t.length > 20) {
			    t = t.substr(0, 20) + '...';
		    }
		    r += '<nametext> | ' + t + '</nametext>';
	    }
        return r;
    } else if(this.textNode) {
        return '[TEXT] ' + this.content.substr(0, 30);
    }
    return 'Element';
}
//End pgParserNode methods


var pgParser = function() {

    var source = null;

    this.singleTags = pgSingleTags;
    this.closingTags = pgAutoClosedTags;

    var _this = this;

    this.assignIds = true;
    this.idPrefix = null;

    var tokenGetTagNameState = 0;

    var tokenGetTagNameRe = /[a-z0-9\?!:\-\=]/i;

    var CHAR_EXCLAMATION = '!'.charCodeAt(0);
    var CHAR_SLASH = '/'.charCodeAt(0);
    var CHAR_CLOSETAG = '>'.charCodeAt(0);
    var CHAR_OPENTAG = '<'.charCodeAt(0);
    var CHAR_QUOTE = '"'.charCodeAt(0);
    var CHAR_SINGLEQUOTE = '\''.charCodeAt(0);

    var tokenGetTagName = function(ch, s, ch_code) {
        if(s.length === 0) {
            tokenGetTagNameState = 0;
            if(ch_code === CHAR_SLASH) return true; //only allow / as the first char of tag name. otherwise <br/> is wrongly parsed
        }
        if(tokenGetTagNameState === 0) {
            if(ch_code === CHAR_EXCLAMATION /* '!' */) {
                tokenGetTagNameState = 1;
            }
        }
        if(tokenGetTagNameState === 1) {
            // we have a !xxx tag
            if(s === '!--') return false; //we have a comment
        }
        return ch.match(tokenGetTagNameRe);
    }

    var tokenGetTagAttributes = function(ch, s, ch_code) {
        return ch_code != CHAR_CLOSETAG; //'>';
    }
    this.replaceExistingIds = false;
    this.replaceExistingExternalIds = false;

    this.nodeCatalogue = pgParserNodeCatalogueInstance;

    this.rootNode = null;

    this.getNode = function(id) {
        return this.nodeCatalogue ? this.nodeCatalogue.get(id) : null;
    }

    this.parse = function(s, done, chunkDone) {

        source = s;
        var _this = this;

        var nodeLevels = [];

        this.rootNode = new pgParserNode;
        this.rootNode.tagName = 'document';
        this.rootNode.rootNode = true;
        this.rootNode.nodeCatalogue = this.nodeCatalogue;
        this.rootNode.document = this.rootNode;

        if(this.assignIds) {
            this.rootNode.assignId();
            if(this.nodeCatalogue) this.nodeCatalogue.add(this.rootNode);
        }

        this.replacedIds = [];

        //nodeLevels.push(this.rootNode);

        var len = source.length;
        var currentNode = this.rootNode;
        var node = null;

        var i = 0;



        var readToken = function(func, parse_quotes, attr_mode) {
            var s = '';
            var start_script = '<?php';
            var start_script2 = '<?=';
            var end_script = '?>';

            var in_script = false;
            do {
                if(startsWithCaseInsensitive(start_script, source, i) || startsWithCaseInsensitive(start_script2, source, i)) {
                    in_script = true;
                } else if(startsWithCaseInsensitive(end_script, source, i)) {
                    in_script = false;
                    s += source.substr(i, end_script.length);
                    i += end_script.length;
                    if(i >= len) break;
                    continue;
                }
                var ch = source.charAt(i);
                var ch_code = source.charCodeAt(i);

                if(in_script) {
                    s += ch;
                } else {
                    if(!func(ch, s, ch_code)) {
                        return s;
                    } else {
                        s += ch;
                        var attr_html_mode = false; //allow <>, dont auto fix open attrs
                        if(parse_quotes && (ch_code === CHAR_QUOTE || ch_code === CHAR_SINGLEQUOTE)) {
                            var quote = ch;
                            var quote_code = ch_code;
                            var escaped = false;
                            i++;
                            while(i < len) {
                                ch = source.charAt(i);
                                ch_code = source.charCodeAt(i);
                                if(ch_code === quote_code && !escaped) {
                                    s += ch;
                                    //i++;
                                    break;
                                }
                                if(attr_mode && ch_code === CHAR_OPENTAG) {
                                    attr_html_mode = true; //looks like <tags> in attr value
                                } else if(attr_mode && ch_code === CHAR_CLOSETAG && !attr_html_mode) {
                                    //missing "?
                                    var fix = true;
                                    var qidx = source.indexOf(quote, i);
                                    if(qidx >= 0) {
                                        var qstr = source.substr(qidx, 2);
                                        if(qstr == '">' || qstr == '" ' || qstr == '"/') {
                                            fix = false; //looks ok
                                        }
                                    }
                                    if(fix) return s + quote;
                                }
                                /*
                                if(!escaped && ch == '\\') {
                                    //escaped = true; disable escaping quotes
                                } else {
                                    escaped = false;
                                }
                                */
                                s += ch;
                                i++;
                            }
                        }
                    }
                }
                i++;
            }
            while(i < len);
            return s;
        }

        var readUntilIncluding = function(tok) {
            var attrs = null;
            var end = source.indexOf(tok, i);
            if(end < 0) {
                attrs = source.substr(i, len - i);
                i = len - 1;
            } else {
                attrs = source.substr(i, end - i + tok.length-1);
                i = end + tok.length-1;
            }
            return attrs;
        }

        var isPrefixedId = function(id) {
            if(typeof id !== 'string') return false;
            var c = id.charCodeAt(0);
            return c >= 48 && c <= 57;
        }


        var doBatch = function() {
            var start_ms = (new Date()).getTime();
            var chunk_max_time = 50;
            var chunks_pi = 100;
            var m = 0;

            while(i < len) {

                var idx = source.indexOf('<', i);
                if(idx < 0) {
                    //only text till the end
                    var textNode = new pgParserNode();
                    textNode.tagName = 'text';
                    textNode.content = source.substr(i);
                    textNode.closingTag = textNode.tagName;
                    textNode.textNode = true;
                    textNode.document = _this.rootNode;

                    if(textNode.content.length) {
                        currentNode.addChild(textNode);
                    }
                    textNode.startStringIndex = i;
                    i = len;
                } else {
                    if(idx > i) {
                        var textContent = source.substr(i, idx - i).split("\n");
                        var text_start_idx = i;
                        for(var ti = 0; ti < textContent.length; ti++) {
                            var textNode = new pgParserNode();
                            textNode.tagName = 'text';
                            textNode.content = ((ti > 0) ? "\n" : "") + textContent[ti];
                            textNode.closingTag = textNode.tagName;
                            textNode.textNode = true;
                            textNode.document = _this.rootNode;
                            textNode.startStringIndex = text_start_idx;
                            text_start_idx += textNode.content.length;

                            if(textNode.content.length) {
                                currentNode.addChild(textNode);
                            }
                        }

                        //  console.log('text = "' + textNode.content + '"');
                    }
                    i = idx + 1;

                    var tag = readToken(tokenGetTagName);
                    var tagLower = tag.toLowerCase();
                    var tag_idx = i - tag.length - 1;

                    var attrs;
                    var comment = false;
                    var script_is_closed = false;

                    if(tag.charCodeAt(0) === CHAR_EXCLAMATION /* '!' */ && tag.indexOf('!--') == 0) {
                        attrs = readUntilIncluding('-->');
                        comment = true;
                    } else if(tagLower === '?php' || tagLower === '?=') {
                        attrs = readUntilIncluding('?>');
                        if(attrs.length && attrs.endsWith('?')) {
                            attrs = attrs.substr(0, attrs.length-1);
                            script_is_closed = true;
                        }
                    } else {
                        attrs = readToken(tokenGetTagAttributes, true, true);
                    }

                    var selfClosedWithSlash = false;

                    if(attrs.length && attrs.charCodeAt(attrs.length-1) === CHAR_SLASH /* '/' */) {
                        selfClosedWithSlash = true;
                        attrs = attrs.substr(0, attrs.length-1);
                    }
                    var isSingleTag = _this.singleTags.indexOf(tag.toLowerCase()) >= 0 || selfClosedWithSlash;

                    if(comment) {
                        isSingleTag = true;
                    }
                    i++; //skip >

                    //console.log('<' + tag + attrs + '>');

                    if(tag.charCodeAt(0) !== CHAR_SLASH /* '/' */) {
                        //opening tag
                        node = new pgParserNode();
                        node.tagName = tagLower;
                        node.tagNameOriginal = tag;
                        if(tagLower === '?php' || tagLower === '?=') {
                            node.script = true;
                            node.content = attrs;
                            attrs = null;
                            node.scriptClosed = script_is_closed;
                        } else {
                            node.script = false;
                        }
                        node.attributes = attrs;
                        node.comment = comment;
                        node.document = _this.rootNode;
                        node.selfClosed = selfClosedWithSlash;

                        node.isElement = !node.script && !node.comment && node.tagName.charCodeAt(0) !== CHAR_EXCLAMATION /* '!' */;
                        node.startStringIndex = tag_idx;

                        //node.getAttrList();


                        currentNode.addChild(node);

                        if(isSingleTag) {
                            node.singleTag = true;
                            node.closed = true;
                            node.endStringIndex = i;
                        } else {
                            nodeLevels.push(currentNode);
                            currentNode = node;
                        }
                        if(tagLower == 'script' || tagLower == 'php' || tagLower == 'textarea') {
                            node.content = readUntilIncluding('</' + tag + '>');
                            node.closingTag = tag;
                            if(node.content.length >= tag.length+2) {
                                node.content = node.content.substr(0, node.content.length - tag.length - 2);
                            }
                            node.closed = true;
                            currentNode = nodeLevels.length ? nodeLevels.pop() : currentNode;
                            i++;
                        }

                        var id = node.getId();

                        if(_this.assignIds && node.shouldHaveId()) {
                            if(!id) {
                                id = node.assignId(_this.idPrefix);
                            } else if(_this.replaceExistingIds) {
                                if(_this.replaceExistingExternalIds) {
                                    var nid = node.assignId(_this.idPrefix);
                                    //_this.replacedIds.push({old: id, new: nid});
                                    id = nid;
                                } else {
                                    if(!isPrefixedId(id)) {
                                        var nid = node.assignId(_this.idPrefix);
                                        id = nid;
                                    }
                                }
                            } else {
                                var id_num = parseInt(id);
                                if(!isNaN(id_num) && id_num > pgIdCount) {
                                    pgIdCount = id_num;
                                }
                            }
                            if(_this.nodeCatalogue) _this.nodeCatalogue.add(node);
                        }
                        node.getAttrList();
                    } else {
                        //closing tag
                        var closedTag = tag.replace('/','').toLowerCase();
                        if(currentNode.tagName == closedTag) {
                            currentNode.closingTag = tag.replace('/','');
                            currentNode.closed = true;
                            currentNode.endStringIndex = i;
                            currentNode = nodeLevels.length ? nodeLevels.pop() : currentNode;
                        } else {
                            var closedLevel = -1;
                            for(var idx = nodeLevels.length - 1; idx >= 0; idx--) {

                                if(nodeLevels[idx].tagName == closedTag) {
                                    closedLevel = idx;
                                    nodeLevels[idx].closingTag = tag.replace('/','');
                                    nodeLevels[idx].closed = true;
                                    break;
                                }
                            }
                            if(closedLevel >= 0) {
                                while(nodeLevels.length > closedLevel + 0) {
                                    var node = nodeLevels.pop();
                                    node.closed = true;

                                    if(_this.closingTags[node.tagName] && node.children.length) {
                                        var ii = 0;
                                        var last = node;
                                        while(ii < node.children.length) {
                                            if(_this.closingTags[node.tagName].indexOf(node.children[ii].tagName) >= 0) {
                                                last = node.children[ii].insertAfter(last);
                                            } else {
                                                ii++;
                                            }
                                        }
                                    }
                                }
                                currentNode = nodeLevels.length ? nodeLevels.pop() : currentNode;
                            } else {
                                currentNode.closingTag = tag.replace('/','');
                                currentNode.closed = true;
                                currentNode = nodeLevels.length ? nodeLevels.pop() : currentNode;
                            }
                        }
                    }
                }

                m++;
                if(m % 10 == 0 && done) {
                    var elapsed_ms = (new Date()).getTime() - start_ms;
                    if(elapsed_ms >= chunk_max_time) {
                        if(chunkDone) chunkDone();
                        setTimeout(doBatch, 10);
                        break;
                    }
                }
            }
            if(i >= len && done) done();
        }
        doBatch();
    }

    this.find = function(sel) {
        return this.rootNode.find(sel);
    }

    this.toStringOriginal = function(format_html, options, func) {
        return this.rootNode.toStringOriginal(format_html, options, func);
    }

    this.toStringWithIds = function(format_html, options, func) {
        return this.rootNode.toStringWithIds(format_html, options, func);
    }

    this.validate = function() {
        return this.rootNode.validateTree();
    }
}

/*
var PgNodeOperation = function(pgel, operation, obj_or_data, undo, redo) {

    this.pgel = pgel;
    this.operation = operation;
    this.data = null;
    this.object = null;

    this.undoFunc = undo;
    this.redoFunc = redo;

    if(obj_or_data) {
        if(obj_or_data instanceof pgParserNode) {
            this.setObject(obj_or_data);
        } else {
            this.data = obj_or_data;
        }
    }
}

PgNodeOperation.prototype.setObject = function(objel) {
    this.object = objel;
}

PgNodeOperation.prototype.getObject = function() {
    return this.object;
}

PgNodeOperation.prototype.getElement = function() {
    return this.pgel;
}

PgNodeOperation.prototype.getElement = function() {
    return this.pgel;
}

PgNodeOperation.prototype.undo = function() {
    try {
        this.in_operation = true;
        this.undoFunc(this);
    } catch(err) {
        //hmm
    }
    this.in_operation = false;
}

PgNodeOperation.prototype.redo = function() {
    try {
        this.in_operation = true;
        this.redoFunc(this);
    } catch(err) {
        //hmm
    }
    this.in_operation = false;
}

var PgNodeOperationList = function() {

    var list = [];

    this.addOperation = function(o) {
        list.push(o);
    }
}

pgParserNode.prototype.makeOperation = function(operation, object, undo, redo) {
    if(this.in_operation) return null;
    var o = new PgNodeOperation(this, operation, object, undo, redo);
    return o;
}
*/

var PgNodeEvent = function(pgel, operation, obj_or_data, data, page) {

    this.pgId = pgel.getId();
    this.operation = operation;
    this.data = null;
    this.objectId = null;
    this.eventType = "PgNodeEvent";
    this.page = page;

    if(obj_or_data) {
        if(obj_or_data instanceof pgParserNode) {
            this.objectId = obj_or_data.getId();
        } else {
            this.data = obj_or_data;
        }
    }

    if(data) this.data = data;
}


PgNodeEvent.prototype.toDebugString = function() {
    var s = this.eventType + ' "' + this.operation + '" (' + this.pgId + ', ' + this.objectId + ', {';
    if(this.data) {
        //debugger;
        $.each(this.data, function(k,v) {
            s += k + ': "' + v + '", ';
        })
    }
    s += '})';
    return s;
}

var pgParserNode_emit_events = true;

pgParserNode.prototype.emitEvent = function(operation, object, data) {
    if(!pgParserNode_emit_events) return null;
    var page = this.getPage();
    if(!page) return null;
    var o = new PgNodeEvent(this, operation, object, data, page);
    if(pinegrow.event_conductor) pinegrow.event_conductor.emit(o);
    return o;
}

pgParserNode.prototype.withEmitEvent = function(func, operation, object, data) {
    var orig = pgParserNode_emit_events;
    pgParserNode_emit_events = false;
    func.call(this);
    pgParserNode_emit_events = orig;
    return this.emitEvent(operation, object, data);
}


var PgEventConductor = function() {

    var count = 0;
    var debug = true;

    var list = [];
    var local_subscribers = [];

    this.emit = function(event) {
        event.eventId = count++;
        //list.push(event);
        if(debug) console.log('Emitted: ' + event.toDebugString());
        for(var i = 0; i < local_subscribers.length; i++) {
            local_subscribers[i](event);
        }
    }

    this.addLocalSubscriber = function(handler) {
        if(local_subscribers.indexOf(handler) < 0) {
            local_subscribers.push(handler);
        }
    }

    this.removeLocalSubscriber = function(handler) {
        var idx = local_subscribers.indexOf(handler);
        if(idx >= 0) {
            local_subscribers.splice(idx, 1);
        }
    }
}

var PgEventHandler = function(port) {

    var debug = true;
    var _this = this;

    if(port === undefined) port = 0;

    this.on_event = null;

    var received = function(event) {
        if(debug) console.log('Received: ' + event.toDebugString());
        if(_this.on_event) _this.on_event(event);
    }

    this.start = function() {
        if(port == 0) {
            pinegrow.event_conductor.addLocalSubscriber(received);
        }
    }

    this.stop = function() {
        if(port == 0) {
            pinegrow.event_conductor.removeLocalSubscriber(received);
        }
    }
}




var PgNodeEventDOMPlayer = function($html) {

    var operations = {};

    var getElement = function(pgid) {
        var sel = '[data-pg-id="' + pgid + '"]';
        if($html.is(sel)) return $html;
        return $html.find(sel);
    }

    this.play = function(event) {
        var $el = getElement(event.pgId);
        var $obj = event.objectId ? getElement(event.objectId) : null;

        if($el.length == 0) {
            //ups
            console.log('Element ' + event.pgId + ' not found');
            return;
        }

        if(event.operation in operations) {
            operations[event.operation](event, $el, $obj);
        } else {
            throw "PgNodeEventDOMPlayer: operation " + event.operation + ' not implemented!';
        }
    }

    operations.setAttr = function(e, $el, $obj) {
        $el.attr(e.data.attr, e.data.value);
    }

    operations.removeAttr = function(e, $el, $obj) {
        $el.removeAttr(e.data.attr);
    }

    operations.replaceTag = function(e, $el, $obj) {
        var attrs = { };

        $.each($el.get(0).attributes, function(idx, attr) {
            attrs[attr.nodeName] = attr.nodeValue;
        });
        var $n;
        $el.replaceWith(function () {
            $n = $("<" + e.data.tag + "/>", attrs).append($el.contents());
            return $n;
        });
    }

    operations.replaceWith = function(e, $el, $obj) {
        $obj.insertBefore($el);
        if(e.data.detach) {
            $el.detach();
        } else {
            $el.remove();
        }
    }

    operations.replaceContentWithContentOf = function(e, $el, $obj) {
        if(e.data.detach) {
            $el.contents().detach();
        } else {
            $el.contents().remove();
        }
        $el.append($obj.contents());
    }

    operations.replaceContentWithElement = function(e, $el, $obj) {
        if(e.data.detach) {
            $el.contents().detach();
        } else {
            $el.contents().remove();
        }
        $el.append($obj);
    }

    operations.detag = function(e, $el, $obj) {
        $el.contents().insertBefore($el);
        $el.remove();
    }

    operations.removeAllChildren = function(e, $el, $obj) {
        $el.contents().remove();
    }

    operations.html = function(e, $el, $obj) {
        $el.html(e.data.html);
    }

    operations.remove = function(e, $el, $obj) {
        $el.remove();
    }

    operations.detach = function(e, $el, $obj) {
        $el.detach();
    }

    operations.appendPrepend = function(e, $el, $obj) {
        if(e.data.prepend) {
            $obj.prepend($el);
        } else {
            $obj.append($el);
        }
    }

    operations.insertBefore = function(e, $el, $obj) {
        $el.insertBefore($obj);
    }

    operations.insertAfter = function(e, $el, $obj) {
        $el.insertAfter($obj);
    }
}

if(typeof module != 'undefined') {
    module.exports = {
        pgParser: pgParser,
        pgParserNode: pgParserNode
    }
}
