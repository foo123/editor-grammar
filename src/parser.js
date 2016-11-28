
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
        self.stack = stack_clone( s.stack, false );
        self.token = s.token;
        self.token2 = s.token2;
        self.block = s.block;
        self.outer = s.outer ? [s.outer[0], s.outer[1], new State(unique, s.outer[2])] : null;
        self.queu = s.queu || null;
        self.symb = s.symb || null;
        self.ctx = s.ctx ? new Stack({symb:s.ctx.val.symb,queu:s.ctx.val.queu}, s.ctx.prev) : null;
        self.hctx = s.hctx ? new Stack({symb:s.hctx.val.symb,queu:s.hctx.val.queu}, s.hctx.prev) : null;
        self.err = s.err || null;
        self.$eol$ = s.$eol$; self.$blank$ = s.$blank$;
    }
    else
    {
        self.line = -1;
        self.bline = -1;
        self.status = s || 0;
        self.stack = null/*[]*/;
        self.token = null;
        self.token2 = null;
        self.block = null;
        self.outer = null;
        self.queu = null;
        self.symb = null;
        self.ctx = null;
        self.hctx = null;
        self.err = self.status & ERRORS ? {} : null;
        self.$eol$ = true; self.$blank$ = true;
    }
}
// make sure to generate a string which will cover most cases where state needs to be updated by the editor
State.prototype.toString = function( ){
    var self = this;
    return self.id+'_'+self.line+'_'+self.bline+'_'+(self.block?self.block.name:'0');
};

function state_backup( state, stream, backup, with_errors )
{
    if ( backup )
    {
        state.status = backup[0];
        state.block = backup[1];
        state.outer = backup[2];
        state.stack = backup[3];
        if ( stream && (stream.pos > backup[4]) ) stream.bck(backup[4]);
    }
    else
    {
        backup = [
            state.status,
            state.block,
            state.outer,
            state.stack,
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
    state.token2 = null;
    state.block = null;
    state.outer = null;
    state.queu = null;
    state.symb = null;
    state.ctx = null;
    state.hctx = null;
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
        if ( state.token2 )
        {
            // already parsed token in previous run
            var T = state.token2[0];
            stream.pos = state.token2[1]; stream.sft();
            state.token = state.token2[3];
            state.$eol$ = stream.eol();
            state.$blank$ = state.$blank$ && (state.token2[2] || state.$eol$);
            state.token2 = null;
            return T;
        }
        var self = this, grammar = self.$grammar, Style = grammar.Style, DEFAULT = self.DEF, ERR = self.ERR,
            T = { }, $name$ = self.$n$, $type$ = self.$t$, $value$ = self.$v$, //$pos$ = 'pos',
            interleaved_tokens = grammar.$interleaved, tokens = grammar.$parser, 
            nTokens = tokens.length, niTokens = interleaved_tokens ? interleaved_tokens.length : 0,
            tokenizer, action, token, line, pos, i, ii, stream_pos, stack_pos,
            type, err, notfound, just_space, block_in_progress, outer = state.outer,
            subgrammar, innerParser, innerState, foundInterleaved, aret,
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
        line = state.line; pos = stream.pos;
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
                    state.outer = null;
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
                            state.outer = null;
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
        if ( state.stack && (T_EOL === state.stack.val.type) && stream.sol() ) state.stack = state.stack.prev;
        
        // check for non-space tokenizer or partial-block-in-progress, before parsing any space/empty
        if ( (!state.stack 
            || (/*(T_NONSPACE !== state.stack.val.type) &&*/ (null == state.block) /*(block_in_progress !== stack[stack.length-1].name)*/)) 
            && stream.spc() )
        {
            // subgrammar follows, push the spaces back and let subgrammar handle them
            if ( state.stack && (T_SUBGRAMMAR === state.stack.val.type) )
            {
                stream.bck( pos );
                tokenizer = state.stack.val;
                state.stack = state.stack.prev;
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
                    outerState = /*new State( 1,*/ state /*)*/;
                }
                else
                {
                    // use actual inner mode
                    innerParser = self.$subgrammars[subgrammar];
                    innerState = new State( 1, inner[subgrammar] ? inner[subgrammar] : state.status );
                    outerState = /*new State( 1,*/ state /*)*/;
                }
                innerState.outer = [self, type.next, outerState];
                return {parser: innerParser, state: innerState, toInner: subgrammar};
                /*}*/
            }
            else
            {
                notfound = true/*false*/;
                just_space = true;
            }
        }
        
        T[$name$] = null; T[$type$] = DEFAULT; T[$value$] = null;
        if ( notfound )
        {
            token = new s_token( );
            // handle space and other token in single run
            if ( just_space ) {token.space = [pos, stream.pos]; stream.sft(); }
            
            i = 0;
            while ( notfound && (state.stack || i<nTokens) && !stream.eol() )
            {
                stream_pos = stream.pos; stack_pos = state.stack;
                
                // check for outer parser interleaved
                if ( outerTokenizer )
                {
                    stream.spc( );
                    if ( tokenize( outerTokenizer, stream, outerState, token ) )
                    {
                        if ( token.space || (stream.pos > stream_pos) )
                        {
                            // match the spaces first
                            if ( token.space )
                            {
                                stream.start = token.space[0];
                                stream.pos = token.space[1];
                            }
                            T[$value$] = stream.cur( 1 );
                            state.$eol$ = stream.eol();
                            state.$blank$ = state.$blank$ && (true || state.$eol$);
                            return T;
                        }
                        else
                        {
                            // dispatch back to outer parser
                            state.outer = null;
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
                    if ( !state.stack && i>=nTokens) break;
                    if ( state.stack )
                    {
                        tokenizer = state.stack.val;
                        state.stack = state.stack.prev;
                    }
                    else
                    {
                        tokenizer = tokens[i++];
                    }
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
                            outerState = /*new State( 1,*/ state /*)*/;
                        }
                        else
                        {
                            // use actual inner sub-grammar parser
                            innerParser = self.$subgrammars[subgrammar];
                            innerState = new State( 1, inner[subgrammar] ? inner[subgrammar] : state.status );
                            outerState = /*new State( 1,*/ state /*)*/;
                        }
                        innerState.outer = [self, type.next, outerState];
                        if ( token.space )
                        {
                            // match the spaces first
                            state.token2 = [{parser: innerParser, state: innerState, toInner: subgrammar}, stream.pos, just_space, state.token];
                            state.token = null;
                            stream.start = token.space[0];
                            stream.pos = token.space[1];
                            T[$value$] = stream.cur( 1 );
                            state.$eol$ = stream.eol();
                            state.$blank$ = state.$blank$ && (true || state.$eol$);
                            return T;
                        }
                        else
                        {
                            return {parser: innerParser, state: innerState, toInner: subgrammar};
                        }
                    }
                    
                    // partial block, apply maybe any action(s) following it
                    if ( state.stack && state.stack.prev && stream.eol() &&  
                        (T_BLOCK & state.stack.val.type) && state.block &&
                        state.block.name === state.stack.val.name 
                    )
                    {
                        ii = state.stack.prev;
                        while ( ii && T_ACTION === ii.val.type )
                        {
                            action = ii; ii = ii.prev;
                            aret = t_action( action, stream, state, token );
                            // action error
                            if ( action.status & ERROR ) state.$actionerr$ = true;
                            else if ( aret && (true !== type) && action.modifier ) type = action.modifier;
                        }
                    }
                    // action token(s) follow, execute action(s) on current token
                    else if ( state.stack && (T_ACTION === state.stack.val.type) )
                    {
                        while ( state.stack && (T_ACTION === state.stack.val.type) )
                        {
                            action = state.stack.val;
                            state.stack = state.stack.prev;
                            aret = t_action( action, stream, state, token );
                            // action error
                            if ( action.status & ERROR ) state.$actionerr$ = true;
                            else if ( aret && (true !== type) && action.modifier ) type = action.modifier;
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
            if ( token.space )
            {
                stream.start = token.space[0];
                stream.pos = token.space[1];
                type = false; token.space = null;
            }
            else
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
        }
        
        T[$value$] = stream.cur( 1 );
        if ( false !== type )
        {
            type = type ? (Style[type] || DEFAULT) : DEFAULT;
            T[$name$] = tokenizer ? tokenizer.name : null;
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
        if ( token.space )
        {
            // return the spaces first
            state.token2 = [T, stream.pos, just_space, state.token];
            state.token = null;
            stream.start = token.space[0]; stream.pos = token.space[1];
            T = {}; T[$name$] = null; T[$type$] = DEFAULT; T[$value$] = stream.cur( 1 );
            just_space = true;
        }
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
    
    ,tokenize: function( stream, mode, row, tokens ) {
        tokens = tokens || [];
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
                mode.parser.tokenize( Stream( lines[i] ), mode, i, linetokens );
            }
            : function( i, linetokens ) {
                linetokens.push( mode.parser.tokenize( Stream( lines[i] ), mode, i ) );
            }, 0, l-1, [] );
        
        else 
            iterate(function( i ) {
                var stream = Stream( lines[i] );
                if ( stream.eol() ) { mode.state.line++; if ( mode.state.$blank$ ) mode.state.bline++; }
                else while ( !stream.eol() ) mode.parser.get( stream, mode );
            }, 0, l-1);
        
        state = mode.state;
        
        if ( parse_errors && state.queu /*&& state.queu.length*/ )
        {
            // generate errors for unmatched tokens, if needed
            while( state.queu/*.length*/ )
            {
                err = state.queu.val/*shift()*/; state.queu = state.queu.prev;
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

    ,autocompletion: function( state, min_found, dynamic ) {
        var stack = state.stack, token, type,
            hash = {}, dynToks = dynamic ? generate_dynamic_autocompletion( state ) : null,
            follows = generate_autocompletion( [ state.token ], [], hash, dynToks );
        min_found  = min_found || 0;
        while( stack )
        {
            token = stack.val; type = token.type;
            if ( T_REPEATED & type )
            {
                follows = generate_autocompletion( [ token ], follows, hash, dynToks );
                if ( (0 < token.min) && (min_found < follows.length) ) break;
            }
            else if ( (T_SIMPLE === type) || (T_ALTERNATION === type) || (T_SEQUENCE_OR_NGRAM & type) )
            {
                follows = generate_autocompletion( [ token ], follows, hash, dynToks );
                if ( min_found < follows.length ) break;
            }
            stack = stack.prev;
        }
        return dynToks && dynToks.length ? dynToks.concat(follows) : follows;
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

