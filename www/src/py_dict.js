;(function($B){

/*
Implementation of Python dictionaries

We can't use Javascript's Map here, because the behaviour is not exactly the
same (eg with keys that are instances of classes with a __hash__ method...)
and because Map is much slower than regular Javascript objects.

A Python dictionary is implemented as a Javascript objects with these
attributes:
. $version: an integer with an initial value of 0, incremented at each
  insertion
. $numeric_dict: for keys of type int
. $string_dict and $str_hash: for keys of type str
. $object_dict: for keys of other types

The value associated to a key in $numeric_dict and $string_dict is a pair
[value, rank] where "value" is the value associated with the key and "rank"
is the value of the dict attribute $version when the pair is inserted. This
is required to keep track of the insertion order, mandatory since Python 3.7.

For keys that are not str or int, their hash value is computed. Since several
keys with the same hash can be stored in a dictionary, $object_dict[hash] is a
list of [key, [value, rank]] lists.
*/

var bltns = $B.InjectBuiltins()
eval(bltns)

var str_hash = _b_.str.__hash__,
    $N = _b_.None

var set_ops = ["eq", "add", "sub", "and", "or", "xor", "le", "lt", "ge", "gt"]

$B.make_view = function(name, set_like){
    var klass = $B.make_class(name, function(items){
        return {
            __class__: klass,
            __dict__: $B.empty_dict(),
            counter: -1,
            items: items,
            len: items.length
        }
    })

    if(set_like){
        for(var i = 0, len = set_ops.length; i < len; i++){
            var op = "__" + set_ops[i] + "__"
            klass[op] = (function(op){
                return function(self, other){
                    // compare set of items to other
                    return _b_.set[op](_b_.set.$factory(self),
                        _b_.set.$factory(other))
                }
            })(op)
        }
    }
    klass.__iter__ = function(self){
        var it = klass.$iterator.$factory(self.items)
        it.len_func = self.len_func
        return it
    }

    klass.__len__ = function(self){
        return self.len
    }

    klass.__repr__ = function(self){
        return klass.$infos.__name__ + '(' + _b_.repr(self.items) + ')'
    }

    $B.set_func_names(klass, "builtins")
    return klass
}

// Special version of __next__ for iterators on dict keys / values / items.
// Checks that the dictionary size didn't change during iteration.
function dict_iterator_next(self){
    if(self.len_func() != self.len){
        throw _b_.RuntimeError.$factory("dictionary changed size during iteration")
    }
    self.counter++
    if(self.counter < self.items.length){
        return self.items[self.counter]
    }
    throw _b_.StopIteration.$factory("StopIteration")
}

var dict = {
    __class__: _b_.type,
    __mro__: [_b_.object],
    $infos: {
        __module__: "builtins",
        __name__: "dict"
    },
    $is_class: true,
    $native: true
}

dict.$to_obj = function(d){
    // Function applied to dictionary that only have string keys,
    // return a Javascript objects with the kays mapped to the value,
    // excluding the insertion rank
    var res = {}
    for(var key in d.$string_dict){
        res[key] = d.$string_dict[key][0]
    }
    return res
}

function to_list(d, ix){
    var items = [],
        item

    if(d.$jsobj){
        items = []
        for(var attr in d.$jsobj){
            if(attr.charAt(0) != "$"){
                var val = d.$jsobj[attr]
                if(val === undefined){val = _b_.NotImplemented}
                else if(val === null){val = $N}
                items.push([attr, val])
            }
        }
    }else{
        for(var k in d.$numeric_dict){
            items.push([parseFloat(k), d.$numeric_dict[k]])
        }

        for(var k in d.$string_dict){items.push([k, d.$string_dict[k]])}

        for(var k in d.$object_dict){
            d.$object_dict[k].forEach(function(item){
                items.push(item)
            })
        }
        // sort by insertion order
        items.sort(function(a, b){
            return a[1][1] - b[1][1]
        })
        items = items.map(function(item){return [item[0], item[1][0]]})
    }

    if(ix !== undefined){
        return items.map(function(item){return item[ix]})
    }else{
        items.__class__ = _b_.tuple
        return items.map(function(item){
            item.__class__ = _b_.tuple; return item}
        )
    }
}

$B.dict_to_list = to_list // used in py_types.js

// Special version of __next__ for iterators on dict keys / values / items.
// Checks that the dictionary size didn't change during iteration.
function dict_iterator_next(self){
    if(self.len_func() != self.len){
        throw _b_.RuntimeError.$factory("dictionary changed size during iteration")
    }
    self.counter++
    if(self.counter < self.items.length){
        return self.items[self.counter]
    }
    throw _b_.StopIteration.$factory("StopIteration")
}


var $copy_dict = function(left, right){
    var _l = to_list(right),
        si = dict.$setitem
    right.$version = right.$version || 0
    var right_version = right.$version || 0
    for(var i = 0, len = _l.length; i < len; i++){
        si(left, _l[i][0], _l[i][1])
        if(right.$version != right_version){
            throw _b_.RuntimeError.$factory("dict mutated during update")
        }
    }
}

function rank(self, hash, key){
    // Search if object key, with hash = hash(key), is in
    // self.$object_dict
    var pairs = self.$object_dict[hash]
    if(pairs !== undefined){
        for(var i = 0, len = pairs.length; i < len; i++){
            if($B.rich_comp("__eq__", key, pairs[i][0])){
                return i
            }
        }
    }
    return -1
}

dict.__bool__ = function () {
    var $ = $B.args("__bool__", 1, {self: null}, ["self"],
        arguments, {}, null, null)
    return dict.__len__($.self) > 0
}

dict.__contains__ = function(){

    var $ = $B.args("__contains__", 2, {self: null, key: null},
        ["self", "key"], arguments, {}, null, null),
        self = $.self,
        key = $.key
    if(self.$is_namespace){key = $B.to_alias(key)} // issue 1244

    if(self.$jsobj){
        return self.$jsobj[key] !== undefined
    }

    switch(typeof key) {
        case "string":
            return self.$string_dict[key] !== undefined
        case "number":
            return self.$numeric_dict[key] !== undefined
    }

    var hash = _b_.hash(key)
    if(self.$str_hash[hash] !== undefined &&
        $B.rich_comp("__eq__", key, self.$str_hash[hash])){return true}
    if(self.$numeric_dict[hash] !== undefined &&
        $B.rich_comp("__eq__", key, hash)){return true}
    return rank(self, hash, key) > -1
}

dict.__delitem__ = function(){

    var $ = $B.args("__eq__", 2, {self: null, arg: null},
        ["self", "arg"], arguments, {}, null, null),
        self = $.self,
        arg = $.arg

    if(self.$jsobj){
        if(self.$jsobj[arg] === undefined){throw _b_.KeyError.$factory(arg)}
        delete self.$jsobj[arg]
        return $N
    }
    switch(typeof arg){
        case "string":
            if(self.$string_dict[arg] === undefined){
                throw _b_.KeyError.$factory(_b_.str.$factory(arg))
            }
            delete self.$string_dict[arg]
            delete self.$str_hash[str_hash(arg)]
            self.$version++
            return $N
        case "number":
            if(self.$numeric_dict[arg] === undefined){
                throw _b_.KeyError.$factory(_b_.str.$factory(arg))
            }
            delete self.$numeric_dict[arg]
            self.$version++
            return $N
    }
    // go with defaults

    var hash = _b_.hash(arg),
        ix

    if((ix = rank(self, hash, arg)) > -1){
        self.$object_dict[hash].splice(ix, 1)
    }else{
        throw _b_.KeyError.$factory(_b_.str.$factory(arg))
    }

    self.$version++
    return $N
}

dict.__eq__ = function(){
    var $ = $B.args("__eq__", 2, {self: null, other: null},
        ["self", "other"], arguments, {}, null, null),
        self = $.self,
        other = $.other

    if(! _b_.isinstance(other, dict)){return false}

    if(self.$jsobj){self = jsobj2dict(self.$jsobj)}
    if(other.$jsobj){other = jsobj2dict(other.$jsobj)}
    if(dict.__len__(self) != dict.__len__(other)){
        return false
    }

    if(self.$string_dict.length != other.$string_dict.length){
        return false
    }

    for(var k in self.$numeric_dict){
        if(other.$numeric_dict.hasOwnProperty(k)){
            if(!$B.rich_comp("__eq__", other.$numeric_dict[k][0],
                    self.$numeric_dict[k][0])){
                return false
            }
        }else if(other.$object_dict.hasOwnProperty(k)){
            var pairs = other.$object_dict[k],
                flag = false
            for(var i = 0, len = pairs.length; i < len; i++){
                if($B.rich_comp("__eq__", k, pairs[i][0]) &&
                        $B.rich_comp("__eq__", self.$numeric_dict[k],
                        pairs[i][1])){
                    flag = true
                    break
                }
            }
            if(! flag){return false}
        }else{
            return false
        }
    }
    for(var k in self.$string_dict){
        if(!other.$string_dict.hasOwnProperty(k) ||
                !$B.rich_comp("__eq__", other.$string_dict[k][0],
                    self.$string_dict[k][0])){
            return false
        }
    }
    for(var hash in self.$object_dict){
        var pairs = self.$object_dict[hash]
        // Get all (key, value) pairs in other that have the same hash
        var other_pairs = []
        if(other.$numeric_dict[hash] !== undefined){
            other_pairs.push([hash, other.$numeric_dict[hash]])
        }
        if(other.$object_dict[hash] !== undefined){
            other_pairs = other_pairs.concat(other.$object_dict[hash])
        }
        if(other_pairs.length == 0){
            return false
        }
        for(var i = 0, len_i = pairs.length; i < len_i; i++){
            var flag = false
            var key = pairs[i][0],
                value = pairs[i][1][0]
            for(var j = 0, len_j = other_pairs.length; j < len_j; j++){
                if($B.rich_comp("__eq__", key, other_pairs[j][0]) &&
                        $B.rich_comp("__eq__", value, other_pairs[j][1][0])){
                    flag = true
                    break
                }
            }
            if(! flag){
                return false
            }
        }
    }
    return true
}

dict.__getitem__ = function(){
    var $ = $B.args("__getitem__", 2, {self: null, arg: null},
        ["self", "arg"], arguments, {}, null, null),
        self = $.self,
        arg = $.arg
    return dict.$getitem(self, arg)
}

dict.$getitem = function(self, arg){
    if(self.$jsobj){
        if(self.$jsobj[arg] === undefined){
            if(self.$jsobj.hasOwnProperty(arg)){
                return $B.Undefined
            }
            throw _b_.KeyError.$factory(arg)
        }
        return self.$jsobj[arg]
    }

    switch(typeof arg){
        case "string":
            if(self.$string_dict[arg] !== undefined){
                return self.$string_dict[arg][0]
            }
            break
        case "number":
            if(self.$numeric_dict[arg] !== undefined){
                return self.$numeric_dict[arg][0]
            }
            break
    }

    // since the key is more complex use 'default' method of getting item

    var hash = _b_.hash(arg),
        _eq = function(other){return $B.rich_comp("__eq__", arg, other)}

    if(typeof arg == "object"){
        arg.$hash = hash // cache for setdefault
    }
    var sk = self.$str_hash[hash]
    if(sk !== undefined && _eq(sk)){
        return self.$string_dict[sk][0]
    }
    if(self.$numeric_dict[hash] !== undefined && _eq(hash)){
         return self.$numeric_dict[hash][0]
    }
    if(_b_.isinstance(arg, _b_.str)){
        // string subclass
        var res = self.$string_dict[arg.valueOf()]
        if(res !== undefined){return res[0]}
    }

    var ix = rank(self, hash, arg)
    if(ix > -1){
        return self.$object_dict[hash][ix][1][0]
    }

    if(self.__class__ !== dict){
        try{
            var missing_method = getattr(self.__class__, "__missing__",
                _b_.None)
        }catch(err){
            console.log(err)

        }
        if(missing_method !== _b_.None){
            return missing_method(self, arg)
        }
    }
    throw _b_.KeyError.$factory(arg)
}

dict.__hash__ = _b_.None

function init_from_list(self, args){
    var i = -1,
        stop = args.length - 1,
        si = dict.__setitem__
    while(i++ < stop){
        var item = args[i]
        switch(typeof item[0]) {
            case 'string':
                self.$string_dict[item[0]] = [item[1], self.$order++]
                self.$str_hash[str_hash(item[0])] = item[0]
                self.$version++
                break
            case 'number':
                self.$numeric_dict[item[0]] = [item[1], self.$order++]
                self.$version++
                break
            default:
                si(self, item[0], item[1])
                break
        }
    }
}

dict.__init__ = function(self, first, second){
    var $
    if(first === undefined){return $N}
    if(second === undefined){
        if(first.__class__ === $B.JSObject){
            self.$jsobj = first.js
            return $N
        }else if(first.$nat != 'kw' && $B.get_class(first) === $B.JSObj){
            for(var key in first){
                self.$string_dict[key] = [first[key], self.$order++]
            }
            return _b_.None
        }else if(first.$jsobj){
            self.$jsobj = {}
            for(var attr in first.$jsobj){
                self.$jsobj[attr] = first.$jsobj[attr]
            }
            return $N
        }else if(Array.isArray(first)){
            init_from_list(self, first)
            return $N
        }
    }

    $ = $ || $B.args("dict", 1, {self:null}, ["self"],
        arguments, {}, "first", "second")
    var args = $.first
    if(args.length > 1){
        throw _b_.TypeError.$factory("dict expected at most 1 argument" +
            ", got 2")
    }else if(args.length == 1){
        args = args[0]
        if(args.__class__ === dict){
            ['$string_dict', '$str_hash', '$numeric_dict', '$object_dict'].
                forEach(function(d){
                    for(key in args[d]){self[d][key] = args[d][key]}
                })
        }else if(_b_.isinstance(args, dict)){
            $copy_dict(self, args)
        }else{
            var keys = $B.$getattr(args, "keys", null)
            if(keys !== null){
                var gi = $B.$getattr(args, "__getitem__", null)
                if(gi !== null){
                    // has keys and __getitem__ : it's a mapping, iterate on
                    // keys and values
                    gi = $B.$call(gi)
                    var kiter = _b_.iter($B.$call(keys)())
                    while(true){
                        try{
                            var key = _b_.next(kiter),
                                value = gi(key)
                                dict.__setitem__(self, key, value)
                        }catch(err){
                            if(err.__class__ === _b_.StopIteration){
                                break
                            }
                            throw err
                        }
                    }
                    return $N
                }
            }
            if(! Array.isArray(args)){
                args = _b_.list.$factory(args)
            }
            // Form "dict([[key1, value1], [key2,value2], ...])"
            init_from_list(self, args)
        }
    }
    var kw = $.second.$string_dict
    for(var attr in kw){
        switch(typeof attr){
            case "string":
                self.$string_dict[attr] = [kw[attr][0], self.$order++]
                self.$str_hash[str_hash(attr)] = attr
                break
            case "number":
                self.$numeric_dict[attr] = [kw[attr][0], self.$order++]
                break
            default:
                si(self, attr, kw[attr][0])
                break
        }
    }
    return $N
}

dict.__iter__ = function(self) {
    return _b_.iter(dict.$$keys(self))
}

dict.__ior__ = function(self, other){
    // PEP 584
    dict.update(self, other)
    return self
}

dict.__len__ = function(self) {
    var _count = 0

    if(self.$jsobj){
        for(var attr in self.$jsobj){if(attr.charAt(0) != "$"){_count++}}
        return _count
    }

    for(var k in self.$numeric_dict){_count++}
    for(var k in self.$string_dict){_count++}
    for(var hash in self.$object_dict){
        _count += self.$object_dict[hash].length
    }

    return _count
}

dict.__ne__ = function(self, other){return ! dict.__eq__(self, other)}

dict.__new__ = function(cls){
    if(cls === undefined){
        throw _b_.TypeError.$factory("int.__new__(): not enough arguments")
    }
    var instance = {
        __class__: cls,
        $numeric_dict : {},
        $object_dict : {},
        $string_dict : {},
        $str_hash: {},
        $version: 0,
        $order: 0
    }
    if(cls !== dict){
        instance.__dict__ = $B.empty_dict()
    }
    return instance
}

dict.__or__ = function(self, other){
    // PEP 584
    if(! _b_.isinstance(other, dict)){
        return _b_.NotImplemented
    }
    var res = dict.copy(self)
    dict.update(res, other)
    return res
}

dict.__repr__ = function(self){
    if(self.$jsobj){ // wrapper around Javascript object
        return dict.__repr__(jsobj2dict(self.$jsobj))
    }
    if($B.repr.enter(self)){
        return "{...}"
    }
    var res = [],
        items = to_list(self)
    items.forEach(function(item){
        try{
            res.push(repr(item[0]) + ": " + repr(item[1]))
        }catch(err){
            throw err
        }
    })
    $B.repr.leave(self)
    return "{" + res.join(", ") + "}"
}

dict.__ror__ = function(self, other){
    // PEP 584
    if(! _b_.isinstance(other, dict)){
        return _b_.NotImplemented
    }
    var res = dict.copy(other)
    dict.update(res, self)
    return res
}

dict.__setitem__ = function(self, key, value){
    var $ = $B.args("__setitem__", 3, {self: null, key: null, value: null},
        ["self", "key", "value"], arguments, {}, null, null)
    return dict.$setitem($.self, $.key, $.value)
}

dict.$setitem = function(self, key, value, $hash){
    // Set a dictionary item mapping key and value.
    //
    // If key is a string, set:
    // - $string_dict[key] = [value, order] where "order" is an auto-increment
    //   unique id to keep track of insertion order
    // - $str_hash[hash(key)] to key
    //
    // If key is a number, set $numeric_dict[key] = value
    //
    // If key is another object, compute its hash value:
    // - if the hash is a key of $str_hash, and key == $str_hash[hash],
    //   replace $string_dict[$str_hash[hash]] by value
    // - if the hash is a key of $numeric_dict, and hash == key, replace
    //   $numeric_dict[hash] by value
    // - if the hash is a key of $object_dict: $object_dict[hash] is a list
    //   of [k, v] pairs. If key is equal to one of the "k", replace the
    //   matching v by value. Otherwise, add [key, value] to the list
    // - else set $object_dict[hash] = [[key, value]]
    //
    // In all cases, increment attribute $version, used to detect dictionary
    // changes during an iteration.
    //
    // Parameter $hash is only set if this method is called by setdefault.
    // In this case the hash of key has already been computed and we
    // know that the key is not present in the dictionary, so it's no
    // use computing hash(key) again, nor testing equality of keys
    if(self.$jsobj){
        if(self.$from_js){
            // dictionary created by method to_dict of JSObject instances
            value = $B.pyobj2jsobj(value)
        }
        if(self.$jsobj.__class__ === _b_.type){
            self.$jsobj[key] = value
            if(key == "__init__" || key == "__new__"){
                // If class attribute __init__ or __new__ are reset,
                // the factory function has to change
                self.$jsobj.$factory = $B.$instance_creator(self.$jsobj)
            }
        }else{
            self.$jsobj[key] = value
        }
        return $N
    }

    switch(typeof key){
        case "string":
            if(self.$string_dict === undefined){
                console.log("pas de string dict", self, key, value)
            }
            if(self.$string_dict[key] !== undefined){
                self.$string_dict[key][0] = value
            }else{
                self.$string_dict[key] = [value, self.$order++]
                self.$str_hash[str_hash(key)] = key
                self.$version++
            }
            return $N
        case "number":
            if(self.$numeric_dict[key] !== undefined){
                // existing key: preserve order
                self.$numeric_dict[key][0] = value
            }else{
                // new key
                self.$numeric_dict[key] = [value, self.$order++]
                self.$version++
            }
            return $N
    }

    // if we got here the key is more complex, use default method

    var hash = $hash === undefined ? _b_.hash(key) : $hash,
        _eq = function(other){return $B.rich_comp("__eq__", key, other)}

    if(self.$numeric_dict[hash] !== undefined && _eq(hash)){
        self.$numeric_dict[hash] = [value, self.$numeric_dict[hash][1]]
        self.$version++
        return $N
    }
    var sk = self.$str_hash[hash]
    if(sk !== undefined && _eq(sk)){
        self.$string_dict[sk] = [value, self.$string_dict[sk][1]]
        self.$version++
        return $N
    }

    // If $setitem is called from setdefault, don't test equality of key
    // with any object
    if($hash){
        if(self.$object_dict[$hash] !== undefined){
            self.$object_dict[$hash].push([key, [value, self.$order++]])
        }else{
            self.$object_dict[$hash] = [[key, [value, self.$order++]]]
        }
        self.$version++
        return $N
    }
    var ix = rank(self, hash, key)
    if(ix > -1){
        // reset value
        self.$object_dict[hash][ix][1] = [value,
            self.$object_dict[hash][ix][1][1]]
        return $N
    }else if(self.$object_dict.hasOwnProperty(hash)){
        self.$object_dict[hash].push([key, [value, self.$order++]])
    }else{
        self.$object_dict[hash] = [[key, [value, self.$order++]]]
    }
    self.$version++
    return $N
}

dict.__str__ = function(){
    return dict.__repr__.apply(null, arguments)
}

// add "reflected" methods
$B.make_rmethods(dict)

dict.clear = function(){
    // Remove all items from the dictionary.
    var $ = $B.args("clear", 1, {self: null}, ["self"], arguments, {},
        null, null),
        self = $.self

    self.$numeric_dict = {}
    self.$string_dict = {}
    self.$str_hash = {}
    self.$object_dict = {}

    if(self.$jsobj){
        for(var attr in self.$jsobj){
            if(attr.charAt(0) !== "$" && attr !== "__class__"){
                delete self.$jsobj[attr]
            }
        }
    }
    self.$version++
    self.$order = 0
    return $N
}

dict.copy = function(self){
    // Return a shallow copy of the dictionary
    var $ = $B.args("copy", 1, {self: null},["self"], arguments,{},
        null, null),
        self = $.self,
        res = $B.empty_dict()
    $copy_dict(res, self)
    return res
}

dict.fromkeys = function(){

    var $ = $B.args("fromkeys", 3, {cls: null, keys: null, value: null},
        ["cls", "keys", "value"], arguments, {value: _b_.None}, null, null),
        keys = $.keys,
        value = $.value

    // class method
    var klass = $.cls,
        res = $B.$call(klass)(),
        keys_iter = $B.$iter(keys)

    while(1){
        try{
            var key = _b_.next(keys_iter)
            if(klass === dict){dict.$setitem(res, key, value)}
            else{$B.$getattr(res, "__setitem__")(key, value)}
        }catch(err){
            if($B.is_exc(err, [_b_.StopIteration])){
                return res
            }
            throw err
        }
    }
}

dict.get = function(){
    var $ = $B.args("get", 3, {self: null, key: null, _default: null},
        ["self", "key", "_default"], arguments, {_default: $N}, null, null)

    try{return dict.__getitem__($.self, $.key)}
    catch(err){
        if(_b_.isinstance(err, _b_.KeyError)){return $._default}
        else{throw err}
    }
}

var dict_items = $B.make_view("dict_items", true)
dict_items.$iterator = $B.make_iterator_class("dict_itemiterator")

dict.items = function(self){
    if(arguments.length > 1){
       var _len = arguments.length - 1,
           _msg = "items() takes no arguments (" + _len + " given)"
       throw _b_.TypeError.$factory(_msg)
    }
    var it = dict_items.$factory(to_list(self))
    it.len_func = function(){return dict.__len__(self)}
    return it
}

var dict_keys = $B.make_view("dict_keys", true)
dict_keys.$iterator = $B.make_iterator_class("dict_keyiterator")

dict.$$keys = function(self){
    if(arguments.length > 1){
       var _len = arguments.length - 1,
           _msg = "keys() takes no arguments (" + _len + " given)"
       throw _b_.TypeError.$factory(_msg)
    }
    var it = dict_keys.$factory(to_list(self, 0))
    it.len_func = function(){return dict.__len__(self)}
    return it
}

dict.pop = function(){

    var missing = {},
        $ = $B.args("pop", 3, {self: null, key: null, _default: null},
        ["self", "key", "_default"], arguments, {_default: missing}, null, null),
        self = $.self,
        key = $.key,
        _default = $._default

    try{
        var res = dict.__getitem__(self, key)
        dict.__delitem__(self, key)
        return res
    }catch(err){
        if(err.__class__ === _b_.KeyError){
            if(_default !== missing){return _default}
            throw err
        }
        throw err
    }
}

dict.popitem = function(self){
    try{
        var itm = _b_.next(_b_.iter(dict.items(self)))
        dict.__delitem__(self, itm[0])
        return _b_.tuple.$factory(itm)
    }catch(err) {
        if (err.__class__ == _b_.StopIteration) {
            throw _b_.KeyError.$factory("'popitem(): dictionary is empty'")
        }
    }
}

dict.setdefault = function(){

    var $ = $B.args("setdefault", 3, {self: null, key: null, _default: null},
            ["self", "key", "_default"], arguments, {_default: $N}, null, null),
        self = $.self,
        key = $.key,
        _default = $._default

    try{return dict.__getitem__(self, key)}
    catch(err){
        if(err.__class__ !== _b_.KeyError){
            throw err
        }
        if(_default === undefined){_default = $N}
        var hash = key.$hash
        key.$hash = undefined
        dict.$setitem(self, key, _default, hash)
        return _default
    }
}

dict.update = function(self){

    var $ = $B.args("update", 1, {"self": null}, ["self"], arguments,
            {}, "args", "kw"),
        self = $.self,
        args = $.args,
        kw = $.kw
    if(args.length > 0){
        var o = args[0]
        if(_b_.isinstance(o, dict)){
            if(o.$jsobj){
                o = jsobj2dict(o.$jsobj)
            }
            $copy_dict(self, o)
        }else if(_b_.hasattr(o, "keys")){
            var _keys = _b_.list.$factory($B.$call($B.$getattr(o, "keys"))())
            for(var i = 0, len = _keys.length; i < len; i++){
                var _value = getattr(o, "__getitem__")(_keys[i])
                dict.$setitem(self, _keys[i], _value)
            }
        }else{
            var it = _b_.iter(o),
                i = 0
            while(true){
                try{
                    var item = _b_.next(it)
                }catch(err){
                    if(err.__class__ === _b_.StopIteration){break}
                    throw err
                }
                try{
                    key_value = _b_.list.$factory(item)
                }catch(err){
                    throw _b_.TypeError.$factory("cannot convert dictionary" +
                        " update sequence element #" + i + " to a sequence")
                }
                if(key_value.length !== 2){
                    throw _b_.ValueError.$factory("dictionary update " +
                        "sequence element #" + i + " has length " +
                        key_value.length + "; 2 is required")
                }
                dict.$setitem(self, key_value[0], key_value[1])
                i++
            }
        }
    }
    $copy_dict(self, kw)
    self.$version++
    return $N
}

var dict_values = $B.make_view("dict_values")
dict_values.$iterator = $B.make_iterator_class("dict_valueiterator")

dict.values = function(self){
    if(arguments.length > 1){
       var _len = arguments.length - 1,
           _msg = "values() takes no arguments (" + _len + " given)"
       throw _b_.TypeError.$factory(_msg)
    }
    var it = dict_values.$factory(to_list(self, 1))
    it.len_func = function(){return dict.__len__(self)}
    return it
}

dict.$factory = function(){
    var res = dict.__new__(dict)
    var args = [res]
    for(var i = 0, len = arguments.length; i < len ; i++){
        args.push(arguments[i])
    }
    dict.__init__.apply(null, args)
    return res
}

_b_.dict = dict

$B.set_func_names(dict, "builtins")

$B.empty_dict = function(){
    return {
        __class__: dict,
        $numeric_dict : {},
        $object_dict : {},
        $string_dict : {},
        $str_hash: {},
        $version: 0,
        $order: 0
    }
}

// This must be done after set_func_names, otherwise dict.fromkeys doesn't
// have the attribute $infos
dict.fromkeys = _b_.classmethod.$factory(dict.fromkeys)

$B.getset_descriptor = $B.make_class("getset_descriptor",
    function(klass, attr){
        return {
            __class__: $B.getset_descriptor,
            __doc__: _b_.None,
            cls: klass,
            attr: attr
        }
    }
)

$B.getset_descriptor.__repr__ = $B.getset_descriptor.__str__ = function(self){
    return `<attribute '${self.attr}' of '${self.cls.$infos.__name__}' objects>`
}

$B.set_func_names($B.getset_descriptor, "builtins")

// Class for attribute __dict__ of classes
var mappingproxy = $B.mappingproxy = $B.make_class("mappingproxy",
    function(obj){
        if(_b_.isinstance(obj, dict)){
            // obj is a dictionary, with $string_dict table such that
            // obj.$string_dict[key] = [value, rank]
            // Transform it into an object with attribute $jsobj such that
            // res.$jsobj[key] = value
            var res = $B.obj_dict(dict.$to_obj(obj))
        }else{
            var res = $B.obj_dict(obj)
        }
        res.__class__ = mappingproxy
        return res
    }
)

mappingproxy.__setitem__ = function(){
    throw _b_.TypeError.$factory("'mappingproxy' object does not support " +
        "item assignment")
}

for(var attr in dict){
    if(mappingproxy[attr] !== undefined ||
            ["__class__", "__mro__", "__new__", "__init__", "__delitem__",
                "clear", "fromkeys", "pop", "popitem", "setdefault",
                "update"].indexOf(attr) > -1){
        continue
    }
    if(typeof dict[attr] == "function"){
        mappingproxy[attr] = (function(key){
            return function(){
                return dict[key].apply(null, arguments)
            }
        })(attr)
    }else{
        mappingproxy[attr] = dict[attr]
    }
}

$B.set_func_names(mappingproxy, "builtins")

function jsobj2dict(x){
    var d = $B.empty_dict()
    for(var attr in x){
        if(attr.charAt(0) != "$" && attr !== "__class__"){
            if(x[attr] === null){
                d.$string_dict[attr] = [_b_.None, d.$order++]
            }else if(x[attr] === undefined){
                continue
            }else if(x[attr].$jsobj === x){
                d.$string_dict[attr] = [d, d.$order++]
            }else{
                d.$string_dict[attr] = [$B.$JS2Py(x[attr]), d.$order++]
            }
        }
    }
    return d
}

$B.obj_dict = function(obj, from_js){
    var klass = obj.__class__ || $B.get_class(obj)
    if(klass !== undefined && klass.$native){
        throw _b_.AttributeError.$factory(klass.__name__ +
            " has no attribute '__dict__'")}
    var res = $B.empty_dict()
    res.$jsobj = obj
    res.$from_js = from_js // set to true if
    return res
}

})(__BRYTHON__)
