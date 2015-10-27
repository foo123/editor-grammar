

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
        self.block = s.block;
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
        self.block = null;
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

function state_dispose( state )
{
    state.id = null;
    state.line = null;
    state.bline = null;
    state.status = null;
    state.stack = null;
    state.block = null;
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
            re_token = re_token || Stream.$RE_NONSPC$;
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
        if ( m = self.slice(self.pos).match( re_space||Stream.$RE_SPC$ ) ) 
        {
            if ( false !== eat ) self.mov( m[0].length );
            return m[0];
        }
    };
    return self;
}
Stream.$RE_SPC$ = /^[\s\u00a0]+/;
Stream.$RE_NONSPC$ = /[^\s\u00a0]/;


// parser factories
var Parser = Class({
    constructor: function Parser( grammar, DEFAULT, ERROR ) {
        var self = this;
        self.$grammar = grammar;
        self.$DEF = DEFAULT || null; self.$ERR = ERROR || null;
        self.DEF = self.$DEF; self.ERR = self.$ERR;
        self.$folders = [];
    }
    
    ,$grammar: null
    ,$folders: null
    ,$n$: 'name', $t$: 'type', $v$: 'token'
    ,$DEF: null, $ERR: null
    ,DEF: null, ERR: null
    
    ,dispose: function( ) {
        var self = this;
        self.$grammar = null;
        self.$folders = null;
        self.$n$ = self.$t$ = self.$v$ = null;
        self.$DEF = self.$ERR = self.DEF = self.ERR = null;
        return self;
    }
    
    ,token: function( stream, state ) {
        var self = this, grammar = self.$grammar, Style = grammar.Style, DEFAULT = self.DEF, ERR = self.ERR,
            T = { }, $name$ = self.$n$, $type$ = self.$t$, $value$ = self.$v$, //$pos$ = 'pos',
            interleaved_tokens = grammar.$interleaved, tokens = grammar.$parser, 
            nTokens = tokens.length, niTokens = interleaved_tokens ? interleaved_tokens.length : 0,
            tokenizer, action, token, stack, line, pos, i, ii, stream_pos, stack_pos,
            type, err, notfound, just_space, block_in_progress
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
        state.$actionerr$ = false;
        stack = state.stack; line = state.line; pos = stream.pos;
        type = false; notfound = true; err = false; just_space = false;
        block_in_progress = state.block ? state.block.name : undef;
        
        // if EOL tokenizer is left on stack, pop it now
        if ( stack.length && T_EOL === stack[stack.length-1].type && stream.sol() ) stack.pop();
        
        // check for non-space tokenizer or partial-block-in-progress, before parsing any space/empty
        if ( (!stack.length 
            || (T_NONSPACE !== stack[stack.length-1].type && block_in_progress !== stack[stack.length-1].name)) 
            && stream.spc() )
        {
            notfound = false;
            just_space = true;
        }
        
        T[$name$] = null; T[$type$] = DEFAULT; T[$value$] = null;
        if ( notfound )
        {
            token = new s_token( );
            
            i = 0;
            while ( notfound && (stack.length || i<nTokens) && !stream.eol() )
            {
                stream_pos = stream.pos; stack_pos = stack.length;
                // dont interleave tokens if partial block is in progress
                if ( niTokens && !state.block )
                {
                    for (ii=0; ii<niTokens; ii++)
                    {
                        tokenizer = interleaved_tokens[ii];
                        type = tokenize( tokenizer, stream, state, token );
                        if ( false !== type ) { notfound = false; break; }
                    }
                    if ( !notfound ) break;
                }
                
                // seems stack and/or ngrams can ran out while inside the loop !!  ?????
                if ( !stack.length && i>=nTokens) break;
                tokenizer = stack.length ? stack.pop() : tokens[i++];
                type = tokenize( tokenizer, stream, state, token );
                
                // match failed
                if ( false === type )
                {
                    // error
                    if ( tokenizer.status & REQUIRED_OR_ERROR )
                    {
                        // empty the stack of the syntax rule group of this tokenizer
                        empty( stack, tokenizer.$id /*|| true*/ );
                        // skip this
                        if ( !stream.nxt( true ) ) { stream.spc( ); just_space = true; }
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
                    // action token(s) follow, execute action(s) on current token
                    if ( stack.length && T_ACTION === stack[stack.length-1].type )
                    {
                        while ( stack.length && T_ACTION === stack[stack.length-1].type )
                        {
                            action = stack.pop(); t_action( action, stream, state, token );
                            // action error
                            if ( action.status & ERROR ) state.$actionerr$ = true;
                        }
                    }
                    // partial block, apply maybe any action(s) following it
                    else if ( stack.length > 1 && stream.eol() &&  
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
                    // not empty
                    if ( true !== type ) { notfound = false; break; }
                }
            }
        }
        
        
        // unknown, bypass, next char/token
        if ( notfound )  stream.nxt( 1/*true*/ ) /*|| stream.spc( )*/;
        
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
    
    ,tokenize: function( stream, state, row ) {
        var self = this, tokens = [];
        //state.line = row || 0;
        if ( stream.eol() ) { state.line++; if ( state.$blank$ ) state.bline++; }
        else while ( !stream.eol() ) tokens.push( self.token( stream, state ) );
        return tokens;
    }
    
    ,parse: function( code, parse_type ) {
        var self = this, lines = (code||"").split(newline_re), l = lines.length,
            linetokens = null, state, parse_errors, parse_tokens, ret;
        
        parse_type = parse_type || TOKENS;
        parse_errors = !!(parse_type & ERRORS);
        parse_tokens = !!(parse_type & TOKENS);
        state = new State( 0, parse_type );
        state.$full_parse$ = true;
        
        // add back the newlines removed from split-ting
        iterate(function( i ){ lines[i] += "\n"; }, 0, l-2);
        
        if ( parse_tokens ) 
            linetokens = iterate(parse_type & FLAT
            ? function( i, linetokens ) {
                linetokens._ = linetokens._.concat( self.tokenize( Stream( lines[i] ), state, i ) );
            }
            : function( i, linetokens ) {
                linetokens._.push( self.tokenize( Stream( lines[i] ), state, i ) );
            }, 0, l-1, {_:[]} )._;
        
        else 
            iterate(function( i ) {
                var stream = Stream( lines[i] );
                //state.line = i;
                if ( stream.eol() ) { state.line++; if ( state.$blank$ ) state.bline++; }
                else while ( !stream.eol() ) self.token( stream, state );
            }, 0, l-1);
        
        ret = parse_tokens && parse_errors
            ? {tokens:linetokens, errors:state.err}
            : (parse_tokens ? linetokens : state.err);
        
        state_dispose( state );
        return ret;
    }

    // overriden
    ,iterator: function( ) { }
    ,validate: function( ) { }
    ,autocomplete: function( ) { }
    ,indent: function( ) { }
    ,fold: function( ) { }
});

function Type( TYPE, positive )
{
    if ( T_STR_OR_ARRAY & get_type( TYPE ) )
        TYPE = new RegExp( map( make_array( TYPE ).sort( by_length ), esc_re ).join( '|' ) );
    return false === positive
    ? function( type ) { return !TYPE.test( type ); }
    : function( type ) { return TYPE.test( type ); };
}

// Counts the column offset in a string, taking tabs into account.
// Used mostly to find indentation.
// adapted from codemirror countColumn
function count_column( string, end, tabSize, startIndex, startValue )
{
    var i, n, nextTab;
    if ( null == end )
    {
        end = string.search(/[^\s\u00a0]/);
        if ( -1 == end ) end = string.length;
    }
    for (i=startIndex||0,n=startValue||0 ;;)
    {
        nextTab = string.indexOf("\t", i);
        if ( nextTab < 0 || nextTab >= end ) return n + (end - i);
        n += nextTab - i;
        n += tabSize - (n % tabSize);
        i = nextTab + 1;
    }
}

function next_tag( iter, T, M, L, R, S )
{
    for (;;)
    {
        M.lastIndex = iter.col;
        var found = M.exec( iter.text );
        if ( !found )
        {
            if ( iter.next( ) )
            {
                iter.text = iter.line( iter.row );
                continue;
            }
            else return;
        }
        if ( !tag_at(iter, found.index+1, T) )
        {
            iter.col = found.index + 1;
            continue;
        }
        iter.col = found.index + found[0].length;
        return found;
    }
}
/*
function prev_tag( iter, T, M, L, R, S )
{
    for (;;)
    {
        var gt = iter.col ? iter.text.lastIndexOf( R, iter.col-1 ) : -1;
        if ( -1 == gt )
        {
            if ( iter.prev( ) )
            {
                iter.text = iter.line( iter.row );
                continue;
            }
            else return;
        }
        if ( !tag_at(iter, gt+1, T) )
        {
            iter.col = gt;
            continue;
        }
        var lastSlash = iter.text.lastIndexOf( S, gt );
        var selfClose = lastSlash > -1 && !/\S/.test(iter.text.slice(lastSlash + 1, gt));
        iter.col = gt + 1;
        return selfClose ? "autoclosed" : "regular";
    }
}
*/
function tag_end( iter, T, M, L, R, S )
{
    var gt, lastSlash, selfClose;
    for (;;)
    {
        gt = iter.text.indexOf( R, iter.col );
        if ( -1 == gt )
        {
            if ( iter.next( ) )
            {
                iter.text = iter.line(  iter.row );
                continue;
            }
            else return;
        }
        if ( !tag_at(iter, gt + 1, T) )
        {
            iter.col = gt + 1;
            continue;
        }
        lastSlash = iter.text.lastIndexOf( S, gt );
        selfClose = lastSlash > -1 && !/\S/.test(iter.text.slice(lastSlash + 1, gt));
        iter.col = gt + 1;
        return selfClose ? "autoclosed" : "regular";
    }
}

function tag_start( iter, T, M, L, R, S )
{
    var lt, match;
    for (;;)
    {
        lt = iter.col ? iter.text.lastIndexOf( L, iter.col-1 ) : -1;
        if ( -1 == lt )
        {
            if ( iter.prev( ) )
            {
                iter.text = iter.line( iter.row );
                continue;
            }
            else return;
        }
        if ( !tag_at(iter, lt + 1, T) )
        {
            iter.col = lt;
            continue;
        }
        M.lastIndex = lt;
        iter.col = lt;
        match = M.exec( iter.text );
        if ( match && match.index == lt ) return match;
    }
}

function tag_at( iter, ch, T )
{
    var type = iter.token(iter.row, ch);
    return type && T( type );
}


function find_matching_close( iter, tag, T, M, L, R, S )
{
    var stack = [], next, end, startLine, startCh, i;
    for (;;)
    {
        next = next_tag(iter, T, M, L, R, S);
        startLine = iter.row; startCh = iter.col - (next ? next[0].length : 0);
        if ( !next || !(end = tag_end(iter, T, M, L, R, S)) ) return;
        if ( end == "autoclosed" ) continue;
        if ( next[1] )
        {
            // closing tag
            for (i=stack.length-1; i>=0; --i)
            {
                if ( stack[i] == next[2] )
                {
                    stack.length = i;
                    break;
                }
            }
            if ( i < 0 && (!tag || tag == next[2]) )
                return {
                    tag: next[2],
                    pos: [startLine, startCh, iter.row, iter.col]
                };
        }
        else
        {
            // opening tag
            stack.push( next[2] );
        }
    }
}
/*
function find_matching_open( iter, tag, T, M, L, R, S )
{
    var stack = [], prev, endLine, endCh, start, i;
    for (;;)
    {
        prev = prev_tag(iter, T, M, L, R, S);
        if ( !prev ) return;
        if ( prev == "autoclosed" )
        {
            tag_start(iter, T, M, L, R, S);
            continue;
        }
        endLine = iter.row, endCh = iter.col;
        start = tag_start(iter, T, M, L, R, S);
        if ( !start ) return;
        if ( start[1] )
        {
            // closing tag
            stack.push( start[2] );
        }
        else
        {
            // opening tag
            for (i = stack.length-1; i>=0; --i)
            {
                if ( stack[i] == start[2] )
                {
                    stack.length = i;
                    break;
                }
            }
            if ( i < 0 && (!tag || tag == start[2]) )
                return {
                    tag: start[2],
                    pos: [iter.row, iter.col, endLine, endCh]
                };
        }
    }
}
*/

// folder factories
var Folder = {
    // adapted from codemirror
    
     _: {
        $notempty$: /\S/,
        $spc$: /^\s*/,
        $block$: /comment/,
        $comment$: /comment/
    }
    
    ,Indented: function( NOTEMPTY ) {
        NOTEMPTY = NOTEMPTY || Folder._.$notempty$;
        
        return function( iter ) {
            var first_line, first_indentation, cur_line, cur_indentation,
                start_pos, end_pos, last_line_in_fold, i, end,
                row = iter.row, col = iter.col;
            
            first_line = iter.line( );
            if ( !NOTEMPTY.test( first_line ) ) return;
            first_indentation = iter.indentation( first_line );
            last_line_in_fold = null; start_pos = first_line.length;
            for (i=row+1,end=iter.last( ); i<=end; ++i)
            {
                cur_line = iter.line( i ); cur_indentation = iter.indentation( cur_line );
                if ( cur_indentation > first_indentation )
                {
                    // Lines with a greater indent are considered part of the block.
                    last_line_in_fold = i;
                    end_pos = cur_line.length;
                }
                else if ( !NOTEMPTY.test( cur_line ) )
                {
                    // Empty lines might be breaks within the block we're trying to fold.
                }
                else
                {
                    // A non-empty line at an indent equal to or less than ours marks the
                    // start of another block.
                    break;
                }
            }
            // return a range
            if ( last_line_in_fold ) return [row, start_pos, last_line_in_fold, end_pos];
        };
    }

    ,Delimited: function( S, E, T ) {
        if ( !S || !E ) return function( ){ };
        T = T || TRUE;

        return function( iter ) {
            var line = iter.row, col = iter.col,
                lineText, startCh, at, pass, found,
                depth, lastLine, end, endCh, i, text, pos, nextOpen, nextClose;
            
            lineText = iter.line( line );
            for (at=col,pass=0 ;;)
            {
                var found = at<=0 ? -1 : lineText.lastIndexOf( S, at-1 );
                if ( -1 == found )
                {
                    if ( 1 == pass ) return;
                    pass = 1;
                    at = lineText.length;
                    continue;
                }
                if ( 1 == pass && found < col ) return;
                if ( T( iter.token( line, found+1 ) ) )
                {
                    startCh = found + S.length;
                    break;
                }
                at = found-1;
            }
            depth = 1; lastLine = iter.last();
            outer: for (i=line; i<=lastLine; ++i)
            {
                text = iter.line( i ); pos = i==line ? startCh : 0;
                for (;;)
                {
                    nextOpen = text.indexOf( S, pos );
                    nextClose = text.indexOf( E, pos );
                    if ( nextOpen < 0 ) nextOpen = text.length;
                    if ( nextClose < 0 ) nextClose = text.length;
                    pos = MIN( nextOpen, nextClose );
                    if ( pos == text.length ) break;
                    if ( pos == nextOpen ) ++depth;
                    else if ( !--depth ) { end = i; endCh = pos; break outer; }
                    ++pos;
                }
            }
            if ( null == end || (line === end && endCh === startCh) ) return;
            return [line, startCh, end, endCh];
        };
    }
    
    ,Pattern: function( S, E, T ) {
        // TODO
        return function( ){ };
    }
    
    ,Markup: function( T, L, R, S, M ) {
        T = T || Type(/\btag\b/);
        L = L || "<"; R = R || ">"; S = S || "/";
        M = M || new RegExp(L+"("+S+"?)([a-zA-Z_][a-zA-Z0-9_\\-:]*)","g");

        return function( iter ) {
            iter.col = 0; iter.min = iter.first( ); iter.max = iter.last( );
            iter.text = iter.line( iter.row );
            var openTag, end, start, close, startLine = iter.row;
            for (;;)
            {
                openTag = next_tag(iter, T, M, L, R, S);
                if ( !openTag || iter.row != startLine || !(end = tag_end(iter, T, M, L, R, S)) ) return;
                if ( !openTag[1] && end != "autoclosed" )
                {
                    start = [iter.row, iter.col];
                    if ( close = find_matching_close(iter, openTag[2], T, M, L, R, S) )
                    {
                        return [start[0], start[1], close.pos[0], close.pos[1]];
                    }
                }
            }
        };
    }

};

