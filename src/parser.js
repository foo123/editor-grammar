

function State( unique, s )
{
    var self = this;
    // this enables unique state "names"
    // thus forces highlight to update
    // however updates also occur when no update necessary ??
    self.id = unique ? uuid("state") : "state";
    if ( s instanceof State )
    {
        // clone
        self.line = s.line;
        self.bline = s.bline;
        self.status = s.status;
        self.stack = s.stack.slice();
        self.token = s.token;
        self.block = s.block;
        self.outer = s.outer;
        // keep extra state only if error handling is enabled
        if ( self.status & ERRORS )
        {
            self.queu = s.queu;
            self.symb = s.symb;
            self.ctx = s.ctx;
            self.err = s.err;
        }
        // else dont use-up more space and clutter
        else
        {
            self.queu = null;
            self.symb = null;
            self.ctx = null;
            self.err = null;
        }
        self.$eol$ = s.$eol$; self.$blank$ = s.$blank$;
    }
    else
    {
        self.line = -1;
        self.bline = -1;
        self.status = s || 0;
        self.stack = [];
        self.token = null;
        self.block = null;
        self.outer = null;
        // keep extra state only if error handling is enabled
        if ( self.status & ERRORS )
        {
            self.queu = [];
            self.symb = {};
            self.ctx = [];
            self.err = {};
        }
        // else dont use-up more space and clutter
        else
        {
            self.queu = null;
            self.symb = null;
            self.ctx = null;
            self.err = null;
        }
        self.$eol$ = true; self.$blank$ = true;
    }
    // make sure to generate a string which will cover most cases where state needs to be updated by the editor
    self.toString = function() {
        return self.id+'_'+self.line+'_'+self.bline+'_'+(self.block?self.block.name:'0');
    };
}

function state_backup( state, stream, backup, with_errors )
{
    if ( backup )
    {
        state.status = backup[0];
        state.block = backup[1];
        state.outer = backup[2];
        if ( state.stack.length > backup[3] ) state.stack.length = backup[3];
        if ( stream && (stream.pos > backup[4]) ) stream.bck(backup[4]);
    }
    else
    {
        backup = [
            state.status,
            state.block,
            state.outer,
            state.stack.length,
            stream ? stream.pos : Infinity
        ];
        if ( false === with_errors ) state.status = 0;
        return backup;
    }
}

function state_dispose( state )
{
    state.id = null;
    state.line = null;
    state.bline = null;
    state.status = null;
    state.stack = null;
    state.token = null;
    state.block = null;
    state.outer = null;
    state.queu = null;
    state.symb = null;
    state.ctx = null;
    state.err = null;
}

// a wrapper to manipulate a string as a stream, based on Codemirror's StringStream
function Stream( line, start, pos )
{
    var self = new String( line );
    self.start = start || 0;
    self.pos = pos || 0;
    
    // string start-of-line?
    self.sol = function( ) { 
        return 0 === self.pos; 
    };
    
    // string end-of-line?
    self.eol = function( ) { 
        return self.pos >= self.length; 
    };
    
    // skip to end
    self.end = function( ) {
        self.pos = self.length;
        return self;
    };

    // move pointer forward/backward n steps
    self.mov = function( n ) {
        self.pos = 0 > n ? MAX(0, self.pos+n) : MIN(self.length, self.pos+n);
        return self;
    };
    
    // move pointer back to pos
    self.bck = function( pos ) {
        self.pos = MAX(0, pos);
        return self;
    };
    
    // move/shift stream
    self.sft = function( ) {
        self.start = self.pos;
        return self;
    };
    
    // next char(s) or whole token
    self.nxt = function( num, re_token ) {
        var c, token = '', n;
        if ( true === num )
        {
            re_token = re_token || Stream.$NONSPC$;
            while ( self.pos<self.length && re_token.test(c=self[CHAR](self.pos++)) ) token += c;
            return token.length ? token : null;
        }
        else
        {
            num = num||1; n = 0;
            while ( n++ < num && self.pos<self.length ) token += self[CHAR](self.pos++);
            return token;
        }
    };
    
    // current stream selection
    self.cur = function( shift ) {
        var ret = self.slice(self.start, self.pos);
        if ( shift ) self.start = self.pos;
        return ret;
    };
    
    // stream selection
    self.sel = function( p0, p1 ) {
        return self.slice(p0, p1);
    };
    
    // eat "space"
    self.spc = function( eat, re_space ) {
        var m;
        if ( m = self.slice(self.pos).match( re_space||Stream.$SPC$ ) ) 
        {
            if ( false !== eat ) self.mov( m[0].length );
            return m[0];
        }
    };
    return self;
}
Stream.$SPC$ = /^[\s\u00a0]+/;
Stream.$NONSPC$ = /[^\s\u00a0]/;
Stream.$NOTEMPTY$ = /\S/;
Stream.$SPACE$ = /^\s*/;

// Counts the column offset in a string, taking tabs into account.
// Used mostly to find indentation.
// adapted from codemirror countColumn
function count_column( string, end, tabSize, startIndex, startValue )
{
    var i, n, nextTab;
    if ( null == end )
    {
        end = string.search( Stream.$NONSPC$ );
        if ( -1 == end ) end = string.length;
    }
    for (i=startIndex||0,n=startValue||0 ;;)
    {
        nextTab = string.indexOf( "\t", i );
        if ( nextTab < 0 || nextTab >= end ) return n + (end - i);
        n += nextTab - i;
        n += tabSize - (n % tabSize);
        i = nextTab + 1;
    }
}


// parser factories
var Parser = Class({
    constructor: function Parser( grammar, DEFAULT, ERROR ) {
        var self = this;
        self.$grammar = grammar;
        self.$DEF = DEFAULT || null; self.$ERR = ERROR || null;
        self.DEF = self.$DEF; self.ERR = self.$ERR;
        self.$folders = [];
        self.$matchers = [];
        self.$subgrammars = {};
    }
    
    ,$grammar: null
    ,$subgrammars: null
    ,$folders: null
    ,$matchers: null
    ,$n$: 'name', $t$: 'type', $v$: 'token'
    ,$DEF: null, $ERR: null
    ,DEF: null, ERR: null
    
    ,dispose: function( ) {
        var self = this;
        self.$grammar = self.$subgrammars = null;
        self.$folders = self.$matchers = null;
        self.$n$ = self.$t$ = self.$v$ = null;
        self.$DEF = self.$ERR = self.DEF = self.ERR = null;
        return self;
    }
    
    ,token: function( stream, state, inner ) {
        var self = this, grammar = self.$grammar, Style = grammar.Style, DEFAULT = self.DEF, ERR = self.ERR,
            T = { }, $name$ = self.$n$, $type$ = self.$t$, $value$ = self.$v$, //$pos$ = 'pos',
            interleaved_tokens = grammar.$interleaved, tokens = grammar.$parser, 
            nTokens = tokens.length, niTokens = interleaved_tokens ? interleaved_tokens.length : 0,
            tokenizer, action, token, stack, line, pos, i, ii, stream_pos, stack_pos,
            type, err, notfound, just_space, block_in_progress, outer = state.outer,
            subgrammar, innerParser, innerState, foundInterleaved,
            outerState = outer && outer[2], outerTokenizer = outer && outer[1]
        ;
        
        // state marks a new line
        if ( stream.sol() )
        {
            if ( state.$eol$ )
            {
                // update count of blank lines at start of file
                if ( state.$blank$ ) state.bline = state.line;
                state.$eol$ = false; state.line++;
            }
            state.$blank$ = state.bline+1 === state.line;
        }
        state.$actionerr$ = false; state.token = null;
        stack = state.stack; line = state.line; pos = stream.pos;
        type = false; notfound = true; err = false; just_space = false;
        //block_in_progress = state.block ? state.block.name : undef;
        
        if ( outer && (self === outer[0]) )
        {
            // use self mode as default passthru INNER mode
            T[$name$] = null; T[$type$] = DEFAULT; T[$value$] = null;
            // check if need to dispatch back to outer parser
            if ( outerTokenizer )
            {
                token = new s_token( );
                if ( tokenize( outerTokenizer, stream, outerState, token ) )
                {
                    //state.outer = null;
                    return {parser: self, state: outerState};
                }
                else
                {
                    stream.nxt( 1/*true*/ );
                }
                while ( !stream.eol() )
                {
                    if ( tokenize( outerTokenizer, stream, outerState, token ) )
                    {
                        if ( stream.pos > pos )
                        {
                            // return current token first
                            break;
                        }
                        else
                        {
                            //state.outer = null;
                            return {parser: self, state: outerState};
                        }
                    }
                    else
                    {
                        stream.nxt( 1/*true*/ );
                    }
                }
            }
            else
            {
                // pass whole line through
                stream.spc( );
                if ( stream.eol( ) ) just_space = true;
                else stream.end( );
            }
            
            T[$value$] = stream.cur( 1 );
            state.$eol$ = stream.eol();
            state.$blank$ = state.$blank$ && (just_space || state.$eol$);
            
            return T;
        }
        
        // if EOL tokenizer is left on stack, pop it now
        if ( stack.length && (T_EOL === stack[stack.length-1].type) && stream.sol() ) stack.pop();
        
        // check for non-space tokenizer or partial-block-in-progress, before parsing any space/empty
        if ( (!stack.length 
            || ((T_NONSPACE !== stack[stack.length-1].type) && (null == state.block) /*(block_in_progress !== stack[stack.length-1].name)*/)) 
            && stream.spc() )
        {
            // subgrammar follows, push the spaces back and let subgrammar handle them
            if ( stack.length && (T_SUBGRAMMAR === stack[stack.length-1].type) )
            {
                stream.bck( pos );
                tokenizer = stack.pop();
                type = tokenize( tokenizer, stream, state, token );
                // subgrammar / submode
                /*if ( type.subgrammar )
                {*/
                // dispatch to inner mode
                subgrammar = ''+type;
                if ( !self.$subgrammars[subgrammar] )
                {
                    // use self as default passthru inner mode
                    innerParser = self;
                    innerState = new State( );
                    outerState = new State( 1, state );
                }
                else
                {
                    // use actual inner mode
                    innerParser = self.$subgrammars[subgrammar];
                    innerState = new State( 1, inner[subgrammar] ? inner[subgrammar] : state.status );
                    outerState = new State( 1, state );
                }
                innerState.outer = [self, type.next, outerState];
                return {parser: innerParser, state: innerState, toInner: subgrammar};
                /*}*/
            }
            else
            {
                notfound = false;
                just_space = true;
            }
        }
        
        T[$name$] = null; T[$type$] = DEFAULT; T[$value$] = null;
        if ( notfound )
        {
            token = new s_token( );
            
            i = 0;
            while ( notfound && (stack.length || i<nTokens) && !stream.eol() )
            {
                stream_pos = stream.pos; stack_pos = stack.length;
                
                // check for outer parser interleaved
                if ( outerTokenizer )
                {
                    stream.spc( );
                    if ( tokenize( outerTokenizer, stream, outerState, token ) )
                    {
                        if ( stream.pos > stream_pos )
                        {
                            // match the spaces first
                            T[$value$] = stream.cur( 1 );
                            state.$eol$ = stream.eol();
                            state.$blank$ = state.$blank$ && (true || state.$eol$);
                            return T;
                        }
                        else
                        {
                            // dispatch back to outer parser
                            //state.outer = null;
                            return {parser: outer[0], state: outerState, fromInner: state};
                        }
                    }
                    stream.bck( stream_pos );
                }
                
                // dont interleave tokens if partial block is in progress
                foundInterleaved = false;
                if ( niTokens && !state.block )
                {
                    for (ii=0; ii<niTokens; ii++)
                    {
                        tokenizer = interleaved_tokens[ii];
                        type = tokenize( tokenizer, stream, state, token );
                        if ( false !== type ) { foundInterleaved = true; break; }
                    }
                    //if ( foundInterleaved || !notfound ) break;
                }
                
                if ( notfound && !foundInterleaved )
                {
                    // seems stack and/or ngrams can ran out while inside the loop !!  ?????
                    if ( !stack.length && i>=nTokens) break;
                    tokenizer = stack.length ? stack.pop() : tokens[i++];
                    type = tokenize( tokenizer, stream, state, token );
                }
                
                // match failed
                if ( false === type )
                {
                    // error
                    if ( tokenizer.status & REQUIRED_OR_ERROR )
                    {
                        // keep it for autocompletion, if needed
                        state.token = tokenizer;
                        
                        // error recovery to a valid parse state and stream position, if any
                        just_space = err_recover( state, stream, token, tokenizer ) || just_space;
                        
                        // generate error
                        err = true; notfound = false; break;
                    }
                    // optional
                    /*else
                    {
                        if ( stream.pos > stream_pos ) stream.bck( stream_pos );
                        if ( stack.length > stack_pos ) stack.length = stack_pos;
                        continue;
                    }*/
                }
                // found token
                else
                {
                    // subgrammar inner parser
                    if ( type.subgrammar )
                    {
                        // dispatch to inner sub-parser
                        subgrammar = ''+type;
                        if ( !self.$subgrammars[subgrammar] )
                        {
                            // use self as default passthru inner parser
                            innerParser = self;
                            innerState = new State( );
                            outerState = new State( 1, state );
                        }
                        else
                        {
                            // use actual inner sub-grammar parser
                            innerParser = self.$subgrammars[subgrammar];
                            innerState = new State( 1, inner[subgrammar] ? inner[subgrammar] : state.status );
                            outerState = new State( 1, state );
                        }
                        innerState.outer = [self, type.next, outerState];
                        return {parser: innerParser, state: innerState, toInner: subgrammar};
                    }
                    
                    // partial block, apply maybe any action(s) following it
                    if ( stack.length > 1 && stream.eol() &&  
                        (T_BLOCK & stack[stack.length-1].type) && state.block &&
                        state.block.name === stack[stack.length-1].name 
                    )
                    {
                        ii = stack.length-2;
                        while ( ii >= 0 && T_ACTION === stack[ii].type )
                        {
                            action = stack[ii--]; t_action( action, stream, state, token );
                            // action error
                            if ( action.status & ERROR ) state.$actionerr$ = true;
                        }
                    }
                    // action token(s) follow, execute action(s) on current token
                    else if ( stack.length && (T_ACTION === stack[stack.length-1].type) )
                    {
                        while ( stack.length && (T_ACTION === stack[stack.length-1].type) )
                        {
                            action = stack.pop();
                            t_action( action, stream, state, token );
                            // action error
                            if ( action.status & ERROR ) state.$actionerr$ = true;
                        }
                    }
                    // not empty
                    if ( true !== type ) { notfound = false; break; }
                }
            }
        }
        
        
        // unknown
        if ( notfound )
        {
            /*
            // check for outer parser
            if ( outerTokenizer && tokenize( outerTokenizer, stream, outerState, token ) )
            {
                // dispatch back to outer parser
                //state.outer = null;
                return {parser: outer[0], state: outerState, fromInner: state};
            }
            */
            // unknown, bypass, next char/token
            stream.nxt( 1/*true*/ ) /*|| stream.spc( )*/;
        }
        
        T[$value$] = stream.cur( 1 );
        if ( false !== type )
        {
            type = Style[type] || DEFAULT;
            T[$name$] = tokenizer.name;
        }
        else if ( err )
        {
            type = ERR;
            if ( state.status & ERRORS )
                error_( state, line, pos, line, stream.pos, tokenizer );
        }
        else
        {
            type = DEFAULT;
        }
        T[$type$] = type;
        state.$eol$ = stream.eol();
        state.$blank$ = state.$blank$ && (just_space || state.$eol$);
        // update count of blank lines at start of file
        //if ( state.$eol$ && state.$blank$ ) state.bline = state.line;
        
        return T;
    }
    
    // get token via multiplexing inner grammars if needed
    ,get: function( stream, mode ) {
        var ret = mode.parser.token( stream, mode.state, mode.inner );
        while ( ret && ret.parser )
        {
            // multiplex inner grammar/parser/state if given
            // save inner parser current state
            if ( ret.fromInner && (mode.parser !== ret.parser) )
            {
                mode.state.err = ret.fromInner.err;
                if ( mode.name ) mode.inner[mode.name] = ret.fromInner;
            }
            // share some state
            ret.state.err = mode.state.err;
            ret.state.line = mode.state.line;
            ret.state.bline = mode.state.bline;
            ret.state.$blank$ = mode.state.$blank$;
            ret.state.$eol$ = mode.state.$eol$;
            ret.state.$full_parse$ = mode.state.$full_parse$;
            // update parser to current parser and associated state
            mode.state = ret.state;
            mode.parser = ret.parser;
            mode.name = ret.toInner;
            // get new token
            ret = mode.parser.get( stream, mode );
        }
        // return token
        return ret;
    }
    
    ,tokenize: function( stream, mode, row ) {
        var tokens = [];
        //mode.state.line = row || 0;
        if ( stream.eol() ) { mode.state.line++; if ( mode.state.$blank$ ) mode.state.bline++; }
        else while ( !stream.eol() ) tokens.push( mode.parser.get( stream, mode ) );
        return tokens;
    }
    
    ,parse: function( code, parse_type ) {
        var lines = (code||"").split(newline_re), l = lines.length,
            linetokens = null, state, mode, parse_errors, parse_tokens, err, ret;
        
        parse_type = parse_type || TOKENS;
        parse_errors = !!(parse_type & ERRORS);
        parse_tokens = !!(parse_type & TOKENS);
        mode = {parser: this, state: new State( 0, parse_type ), inner: {}};
        mode.state.$full_parse$ = true;
        
        // add back the newlines removed from split-ting
        iterate(function( i ){ lines[i] += "\n"; }, 0, l-2);
        
        if ( parse_tokens ) 
            linetokens = iterate(parse_type & FLAT
            ? function( i, linetokens ) {
                linetokens._ = linetokens._.concat( mode.parser.tokenize( Stream( lines[i] ), mode, i ) );
            }
            : function( i, linetokens ) {
                linetokens._.push( mode.parser.tokenize( Stream( lines[i] ), mode, i ) );
            }, 0, l-1, {_:[]} )._;
        
        else 
            iterate(function( i ) {
                var stream = Stream( lines[i] );
                if ( stream.eol() ) { mode.state.line++; if ( mode.state.$blank$ ) mode.state.bline++; }
                else while ( !stream.eol() ) mode.parser.get( stream, mode );
            }, 0, l-1);
        
        state = mode.state;
        if ( parse_errors && state.queu && state.queu.length )
        {
            // generate errors for unmatched tokens, if needed
            while( state.queu.length )
            {
                err = state.queu.shift( );
                error_( state, err[1], err[2], err[3], err[4], null, err[5] );
            }
        }
        
        ret = parse_tokens && parse_errors
            ? {tokens:linetokens, errors:state.err}
            : (parse_tokens ? linetokens : state.err);
        
        state_dispose( state );
        mode = state = null;
        return ret;
    }

    ,autocompletion: function( state, min_found ) {
        var stack = state.stack, i, token, type,
            hash = {}, follows = generate_autocompletion( [ state.token ], [], hash );
        min_found  = min_found || 0;
        for(i=stack.length-1; i>=0; i--)
        {
            token = stack[ i ]; type = token.type;
            if ( T_REPEATED & type )
            {
                follows = generate_autocompletion( [ token ], follows, hash );
                if ( (0 < token.min) && (min_found < follows.length) ) break;
            }
            else if ( (T_SIMPLE === type) || (T_ALTERNATION === type) || (T_SEQUENCE_OR_NGRAM & type) )
            {
                follows = generate_autocompletion( [ token ], follows, hash );
                if ( min_found < follows.length ) break;
            }
        }
        return follows;
    }
    
    // overriden
    ,subparser: function( name, parser ) {
        var self = this;
        if ( false === parser )
        {
            // remove
            if ( self.$subgrammars[HAS](name) )
                delete self.$subgrammars[name];
        }
        else if ( parser )
        {
            // add
            self.$subgrammars[name] = parser;
        }
        return self;
    }
    ,iterator: function( ) { }
    ,validate: function( ) { }
    ,autocomplete: function( ) { }
    ,indent: function( ) { }
    ,fold: function( ) { }
    ,match: function( ) { }
});

