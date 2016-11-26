
//
// tokenizers
// change to functional-oriented instead of object-oriented approach to tokenizers and parsing

function matcher( type, name, pattern, ptype, key )
{
    var self = this, PT, T;
    PT = self.type = type;
    self.name = name;
    self.pattern = pattern;
    T = self.ptype = ptype || T_STR;
    self.key = key || 0;
    if ( P_COMPOSITE === PT )
    {
        self.key = false !== key;
    }
    else if ( P_BLOCK === PT )
    {
        self.pattern[0] = new matcher( P_COMPOSITE, name + '_Start', pattern[0], null, false );
    }
    else //if ( P_SIMPLE === PT )
    {
        if ( T_NULL === T )
            self.pattern = null;
        else if ( T_REGEX === T )
            self.pattern = T_REGEX&get_type(pattern) ? [pattern, 0] : [pattern[0], pattern[1]||0];
    }
}

/*function m_dispose( t )
{
    t.type = null;
    t.name = null;
    t.pattern = null;
    t.ptype = null;
    t.key = null;
}*/

function t_match( t, stream, eat, any_match )
{
    var self = t, PT = self.type, name, type,
        pattern = self.pattern, key = self.key,
        start, ends, end, match, m, T, T0, i, n, c
    ;
    
    if ( P_BLOCK === PT )
    {
        name = self.name;
        start = pattern[0]; ends = pattern[1];
        
        // matches start of block using startMatcher
        // and returns the associated endBlock matcher
        if ( match = t_match( start, stream, eat, any_match ) )
        {
            // use the token key to get the associated endMatcher
            end = ends[ match[0] ];
            T = get_type( end ); T0 = start.pattern[ match[0] ].ptype;
            
            // regex group number given, get the matched group pattern for the ending of this block
            // string replacement pattern given, get the proper pattern for the ending of this block
            if ( (T_REGEX === T0) && (T_STR_OR_NUM & T) )
            {
                // the regex is wrapped in an additional group, 
                // add 1 to the requested regex group transparently
                if ( end.regex_pattern )
                {
                    // dynamicaly-created regex with substistution group as well
                    m = group_replace( end, match[1]/*, 0, 1*/ );
                    end = new matcher( P_SIMPLE, name+'_End', get_re(m, end.regex_pattern, {}), T_REGEX );
                }
                else
                {
                    // dynamicaly-created string with substistution group as well
                    m = T_NUM & T ? match[1][ end+1 ] : group_replace( end, match[1] );
                    end = new matcher( P_SIMPLE, name+'_End', m, m.length>1 ? T_STR : T_CHAR );
                }
            }
            return end;
        }
    }
    else if ( P_COMPOSITE === PT )
    {
        for (i=0,n=pattern.length; i<n; i++)
        {
            // each one is a matcher in its own
            m = t_match( pattern[ i ], stream, eat, any_match );
            if ( m ) return key ? [ i, m[1] ] : m;
        }
    }
    else //if ( P_SIMPLE === PT )
    {
        type = self.ptype;
        if ( T_NULL === type /*|| null === pattern*/ )
        {
            // up to end-of-line
            if ( false !== eat ) stream.end( ); // skipToEnd
            return [ key, "" ];
        }
        else if ( T_REGEX === type )
        {
            m = pattern[0].xflags.l ? stream.match( pattern[0] ) : stream.slice( stream.pos ).match( pattern[0] );
            if ( m && (0 === m.index) )
            {
                if ( false !== eat ) stream.mov( m[ pattern[1]||0 ].length );
                return [ key, pattern[1] > 0 ? m[pattern[1]] : m ];
            }
        }
        else if ( T_CHARLIST === type )
        {
            if ( true === any_match )
            {
                m = -1;
                var mm, cc;
                for(n=pattern.length-1; n>=0; n--)
                {
                    mm = stream.indexOf(pattern[CHAR](n), stream.pos);
                    if ( -1 < mm && (-1 === m || mm < m) ) 
                    {
                        m = mm; cc = pattern[CHAR](n);
                    }
                }
                if ( -1 < m ) 
                {
                    if ( false !== eat ) stream.pos = m+1;
                    return [ key, cc ];
                }
            }
            else
            {
                m = stream[CHAR](stream.pos) || null;
                if ( m && (-1 < pattern.indexOf( m )) ) 
                {
                    if ( false !== eat ) stream.mov( 1 );
                    return [ key, m ];
                }
            }
        }
        else if ( T_CHAR === type )
        {
            if ( true === any_match )
            {
                m = stream.indexOf(pattern, stream.pos);
                if ( -1 < m ) 
                {
                    if ( false !== eat ) stream.pos = m+1;
                    return [ key, pattern ];
                }
            }
            else
            {
                m = stream[CHAR](stream.pos) || null;
                if ( pattern === m ) 
                {
                    if ( false !== eat ) stream.mov( 1 );
                    return [ key, m ];
                }
            }
        }
        else if ( T_STR === type ) // ?? some pattern is undefined !!!!!!!!!
        {
            n = pattern.length;
            if ( true === any_match )
            {
                m = stream.indexOf(pattern, stream.pos);
                if ( -1 < m ) 
                {
                    if ( false !== eat ) stream.pos = m+n;
                    return [ key, pattern ];
                }
            }
            else
            {
                if ( pattern === stream.substr(stream.pos, n) ) 
                {
                    if ( false !== eat ) stream.mov( n );
                    return [ key, pattern ];
                }
            }
        }
    }
    return false;
}

function Stack( val, prev/*, next*/ )
{
    this.val = val || null;
    /*if ( prev && next )
    {
        this.prev = prev; this.next = next;
        prev.next = next.prev = this;
    }
    else*/ if ( prev )
    {
        //this.next = null;
        /*if ( prev.next )
        {
            prev.next.prev = this;
            this.next = prev.next;
        }*/
        this.prev = prev;
        //prev.next = this;
    }
    /*else if ( next )
    {
        this.prev = null;
        if ( next.prev )
        {
            next.prev.next = this;
            this.prev = next.prev;
        }
        this.next = next;
        next.prev = this;
    }*/
    else
    {
        this.prev = null;
        //this.next = null;
    }
}

function tokenizer( type, name, token, msg, modifier, except, autocompletions, keywords )
{
    var self = this;
    self.type = type;
    self.name = name;
    self.token = token;
    self.modifier = modifier || null;
    self.except = except || null;
    self.autocompletions = autocompletions || null;
    self.keywords = keywords || null;
    self.pos = null;
    self.msg = false === msg ? false : (msg || null);
    self.$msg = null;
    self.status = 0;
    self.empty = false; self.ci = false; self.mline = true; self.esc = false; self.inter = false;
    self.found = 0; self.min = 0; self.max = 1; self.i0 = 0;
    self.$id = null;
}

function s_token( )
{
    var t = this;
    t.T = 0;
    t.id = null;
    t.type = null;
    t.match = null;
    t.str = '';
    t.pos = null;
    t.block = null;
    t.space = null;
}

function t_clone( t, required, modifier, $id )
{
    var tt = new tokenizer( t.type, t.name, t.token, t.msg, t.modifier, t.except, t.autocompletions, t.keywords );
    tt.empty = t.empty; tt.ci = t.ci; tt.mline = t.mline; tt.esc = t.esc; tt.inter = t.inter;
    tt.found = t.found; tt.min = t.min; tt.max = t.max; tt.i0 = t.i0;
    if ( required ) tt.status |= REQUIRED;
    if ( modifier ) tt.modifier = modifier;
    if ( $id ) tt.$id = $id;
    return tt;
}

/*function t_dispose( t )
{
    t.type = null;
    t.name = null;
    t.token = null;
    t.modifier = null;
    t.except = null;
    t.autocompletions = null;
    t.keywords = null;
    t.pos = null;
    t.msg = null; t.$msg = null;
    t.status = null;
    t.ci = null; t.mline = null; t.esc = null; t.inter = null;
    t.found = null; t.min = null; t.max = t.i0 = null;
    t.$id = null;
}*/

function t_err( t )
{
    var T = t.name;
    return t.$msg
        ? t.$msg
        : (
            t.status & REQUIRED
            ? 'Token "'+T+'"'+(t.keywords?': '+t.keywords:'')+' Expected'
            : 'Syntax Error: "'+T+'"'
        );
}

function error_( state, l1, c1, l2, c2, t, err )
{
    if ( (state.status & ERRORS) && state.err )
    state.err[ ''+l1+'_'+c1+'_'+l2+'_'+c2+'_'+(t?t.name:'ERROR') ] = [ l1, c1, l2, c2, err || t_err( t ) ];
    //return state;
}

function find_key( list, key, least, hash )
{
    if ( hash )
    {
        return list && list[HAS](key) ? list[key] : null;
    }
    else
    {
        var next = null, match = null;
        while ( list )
        {
            if ( key === list.val[0] )
            {
                match = {prev:list.prev, next:next, node:list, val:list.val[1]};
                if ( !least ) return match;
            }
            next = list; list = list.prev;
        }
        return match;
    }
}

function add_key( list, key, val, hash )
{
    if ( hash )
    {
        list[key] = val;
        return list;
    }
    else
    {
        return new Stack([key,val], list);
    }
}

function push_at( state, pos, token )
{
    if ( state.stack === pos )
    {
        pos = state.stack = new Stack( token, state.stack );
    }
    else
    {
        var ptr = state.stack;
        while ( ptr && (ptr.prev !== pos) ) ptr = ptr.prev;
        pos = new Stack(token, pos);
        if ( ptr) ptr.prev = pos;
    }
    return pos;
}

function empty( state, $id )
{
    // http://dvolvr.davidwaterston.com/2013/06/09/restating-the-obvious-the-fastest-way-to-truncate-an-array-in-javascript/
    if ( true === $id )
    {
        // empty whole stack
        state.stack = null;
    }
    else if ( $id )
    {
        // empty only entries associated to $id
        while ( state.stack && state.stack.val.$id === $id ) state.stack = state.stack.prev;
    }
    /*else if ( count )
    {
        // just pop one
        stack.length =  count-1;
    }*/
    return state;
}

function stack_clone( stack, deep )
{
    if ( null == stack ) return null;
    if ( deep )
    {
        var stack2 = new Stack( stack.val ), ptr2 = stack2, ptr = stack;
        while( ptr.prev )
        {
            ptr2.prev = new Stack( ptr.prev.val );
            ptr = ptr.prev; ptr2 = ptr2.prev;
        }
        return stack2;
    }
    else
    {
        return stack;
    }
}

function err_recover( state, stream, token, tokenizer )
{
    //var just_space = false;
    // empty the stack of the syntax rule group of this tokenizer
    //empty( stack, tokenizer.$id /*|| true*/ );
    
    // skip this
    //if ( tokenizer.pos > stream.pos ) stream.pos = tokenizer.pos;
    //else if ( !stream.nxt( true ) ) { stream.spc( ); just_space = true; }
    
    var stack_pos, stream_pos, stream_pos2, tok, depth,
        recover_stream = Infinity, recover_stack = null, recover_depth = Infinity;
    stream_pos = stream.pos;
    stream.spc( );
    stream_pos2 = stream.pos;
    stack_pos = state.stack;
    if ( stream.pos < stream.length )
    {
        // try to recover in a state with:
        // 1. the closest stream position that matches a tokenizer in the stack (more important)
        // 2. and the minimum number of stack tokenizers to discard (less important)
        depth = 0;
        while( stack_pos )
        {
            tok = stack_pos.val;
            if ( tok.$id !== tokenizer.$id ) break;
            while( (T_ACTION !== tok.type) && !tokenize(tok, stream, state, token) )
            {
                stream.pos = tok.pos > stream.pos ? tok.pos : stream.pos+1;
                state.stack = stack_pos;
                if ( stream.pos >= stream.length ) break;
            }
            state.stack = stack_pos;
            
            if ( (stream.pos < stream.length) && (recover_stream > stream.pos) )
            {
                recover_stream = stream.pos;
                recover_stack = stack_pos;
                recover_depth = depth;
            }
            else if ( (recover_stream === stream.pos) && (depth < recover_depth) )
            {
                recover_stream = stream.pos;
                recover_stack = stack_pos;
                recover_depth = depth;
            }
            
            stream.pos = stream_pos2;
            stack_pos = stack_pos.prev;
            depth++;
        }
        
        if ( recover_stream < stream.length )
        {
            stream.pos = recover_stream;
            state.stack = recover_stack;
        }
        else
        {
            stream.end( );
            state.stack = null;
        }
    }
    /*else
    {
    }*/
    return (stream_pos2 >= stream_pos) && (stream.pos === stream_pos2);
}

function tokenize( t, stream, state, token )
{
    //console.log( t );
    if ( !t ) return false;
    var T = t.type, 
        t_ = T_COMPOSITE & T
        ? t_composite
        : (
            T_BLOCK & T
            ? t_block
            : ( T_ACTION & T ? t_action : t_simple )
        );
    return t_( t, stream, state, token );
}

function t_action( a, stream, state, token )
{
    var self = a, action_def = self.token || null,
    action, case_insensitive = self.ci, aid = self.name,
    t, t0, ns, msg, queu, symb, found,
    l1, c1, l2, c2, in_ctx, in_hctx, err, t_str, is_block,
    no_state_errors = !(state.status & ERRORS);

    self.status = 0; self.$msg = null;

    // do action only if state.status handles (action) errors, else dont clutter
    if ( /*no_state_errors ||*/ !action_def || !token || !token.pos ) return true;
    is_block = !!(T_BLOCK & token.T);
    // NOP action, return OR partial block not completed yet, postpone
    if ( A_NOP === action_def[ 0 ] || is_block && !token.block ) return true;

    action = action_def[ 0 ]; t = action_def[ 1 ]; in_ctx = action_def[ 2 ]; in_hctx = action_def[ 3 ];
    msg = self.msg;
    
    if ( is_block /*&& token.block*/ )
    {
        t_str = token.block.match || token.block.str;
        l1 = token.block.pos[0][0];     c1 = token.block.pos[0][1];
        l2 = token.block.pos[0][2];     c2 = token.block.pos[0][3];
    }
    else
    {
        t_str = token.match || token.str;
        l1 = token.pos[0];              c1 = token.pos[1];
        l2 = token.pos[2];              c2 = token.pos[3];
    }

    if ( A_CTXEND === action )
    {
        state.ctx = state.ctx ? state.ctx.prev : null;
    }

    else if ( A_CTXSTART === action )
    {
        state.ctx = new Stack({symb:null,queu:null}, state.ctx);
    }

    else if ( A_HYPCTXEND === action )
    {
        state.hctx = state.hctx ? state.hctx.prev : null;
    }

    else if ( A_HYPCTXSTART === action )
    {
        state.hctx = new Stack({symb:null,queu:null}, state.hctx);
    }

    else if ( A_DEFINE === action )
    {
        symb = in_hctx && state.hctx ? state.hctx.val.symb : (in_ctx && state.ctx ? state.ctx.val.symb : state.symb);
        t0 = t[1]; ns = t[0];
        t0 = group_replace( t0, t_str, true );
        if ( case_insensitive ) t0 = t0[LOWER]();
        ns += '::'+t0; found = find_key(symb, ns);
        if ( !found || (found.val[0] > l1) || ((found.val[0] === l1) && (found.val[1] > c1)) || ((found.val[0] === l1) && (found.val[1] === c1) && ((found.val[2] > l2) || (found.val[3] > c2))) )
        {
            if ( found )
            {
                found.val[0] = l1; found.val[1] = c1;
                found.val[2] = l2; found.val[3] = c2;
            }
            else
            {
                if ( in_hctx && state.hctx )
                {
                    state.hctx.val.symb = add_key(state.hctx.val.symb, ns, [l1, c1, l2, c2]);
                }
                else if ( in_ctx && state.ctx )
                {
                    state.ctx.val.symb = add_key(state.ctx.val.symb, ns, [l1, c1, l2, c2]);
                }
                else
                {
                    state.symb = add_key(state.symb, ns, [l1, c1, l2, c2]);
                }
            }
        }
    }
    
    else if ( A_UNDEFINE === action )
    {
        symb = in_hctx && state.hctx ? state.hctx.val.symb : (in_ctx && state.ctx ? state.ctx.val.symb : state.symb);
        if ( !symb ) return true;
        t0 = t[1]; ns = t[0];
        t0 = group_replace( t0, t_str, true );
        if ( case_insensitive ) t0 = t0[LOWER]();
        ns += '::'+t0; found = find_key(symb, ns);
        if ( found && ((found.val[0] < l1) || ((found.val[0] === l1) && (found.val[1] <= c1))) )
        {
            if ( found.next )
            {
                found.next.prev = found.prev;
            }
            else
            {
                if ( in_hctx && state.hctx )
                {
                    state.hctx.val.symb = state.hctx.val.symb.prev;
                }
                else if ( in_ctx && state.ctx )
                {
                    state.ctx.val.symb = state.ctx.val.symb.prev;
                }
                else
                {
                    state.symb = state.symb.prev;
                }
            }
        }
    }
    
    else if ( A_DEFINED === action )
    {
        symb = in_hctx && state.hctx ? state.hctx.val.symb : (in_ctx && state.ctx ? state.ctx.val.symb : state.symb);
        t0 = t[1]; ns = t[0];
        t0 = group_replace( t0, t_str, true );
        if ( case_insensitive ) t0 = t0[LOWER]();
        ns += '::'+t0; found = find_key(symb, ns);
        if ( !found || (found.val[0] > l1) || ((found.val[0] === l1) && (found.val[1] > c1)) || ((found.val[0] === l1) && (found.val[1] === c1) && ((found.val[2] > l2) || (found.val[3] > c2))) )
        {
            // undefined
            if ( false !== msg )
            {
                self.$msg = msg
                    ? group_replace( msg, t0, true )
                    : 'Undefined "'+t0+'"';
                err = t_err( self );
                error_( state, l1, c1, l2, c2, self, err );
                self.status |= ERROR;
            }
            if ( found )
            {
                if ( found.next )
                {
                    found.next.prev = found.prev;
                }
                else
                {
                    if ( in_hctx && state.hctx )
                    {
                        state.hctx.val.symb = state.hctx.val.symb.prev;
                    }
                    else if ( in_ctx && state.ctx )
                    {
                        state.ctx.val.symb = state.ctx.val.symb.prev;
                    }
                    else
                    {
                        state.symb = state.symb.prev;
                    }
                }
            }
            return false;
        }
    }
    
    else if ( A_NOTDEFINED === action )
    {
        symb = in_hctx && state.hctx ? state.hctx.val.symb : (in_ctx && state.ctx ? state.ctx.val.symb : state.symb);
        if ( !symb ) return true;
        t0 = t[1]; ns = t[0];
        t0 = group_replace( t0, t_str, true );
        if ( case_insensitive ) t0 = t0[LOWER]();
        ns += '::'+t0; found = find_key(symb, ns, 1);
        if ( found && ((found.val[0] < l1) || ((found.val[0] === l1) && (found.val[1] <= c1)) || ((found.val[0] === l1) && (found.val[1] === c1) && ((found.val[2] <= l2) && (found.val[3] <= c2)))) )
        {
            // defined
            if ( false !== msg )
            {
                self.$msg = msg
                    ? group_replace( msg, t0, true )
                    : 'Defined "'+t0+'"';
                err = t_err( self );
                error_( state, found.val[0], found.val[1], found.val[2], found.val[3], self, err );
                error_( state, l1, c1, l2, c2, self, err );
                self.status |= ERROR;
            }
            return false;
        }
    }
    
    // above actions can run during live editing as well
    if ( no_state_errors ) return true;
    
    if ( A_ERROR === action )
    {
        if ( !msg && (T_STR & get_type(t)) ) msg = t;
        self.$msg = msg ? group_replace( msg, t_str, true ) : 'Error "' + aid + '"';
        error_( state, l1, c1, l2, c2, self, t_err( self ) );
        self.status |= ERROR;
        return false;
    }

    else if ( A_UNIQUE === action )
    {
        if ( in_hctx )
        {
            if ( state.hctx ) symb = state.hctx.val.symb;
            else return true;
        }
        else if ( in_ctx )
        {
            if ( state.ctx ) symb = state.ctx.val.symb;
            else return true;
        }
        else
        {
            symb = state.symb;
        }
        t0 = t[1]; ns = t[0];
        t0 = group_replace( t0, t_str, true );
        if ( case_insensitive ) t0 = t0[LOWER]();
        ns += '::'+t0; found = find_key(symb, ns);
        if ( found )
        {
            // duplicate
            if ( false !== msg )
            {
                self.$msg = msg
                    ? group_replace( msg, t0, true )
                    : 'Duplicate "'+t0+'"';
                err = t_err( self );
                error_( state, found.val[0], found.val[1], found.val[2], found.val[3], self, err );
                error_( state, l1, c1, l2, c2, self, err );
                self.status |= ERROR;
            }
            return false;
        }
        else
        {
            if ( in_hctx )
            {
                state.hctx.val.symb = add_key(state.hctx.val.symb, ns, [l1, c1, l2, c2]);
            }
            else if ( in_ctx )
            {
                state.ctx.val.symb = add_key(state.ctx.val.symb, ns, [l1, c1, l2, c2]);
            }
            else
            {
                state.symb = add_key(state.symb, ns, [l1, c1, l2, c2]);
            }
        }
    }
    
    else if ( A_MCHEND === action )
    {
        if ( in_hctx )
        {
            if ( state.hctx ) queu = state.hctx.val.queu;
            else return true;
        }
        else if ( in_ctx )
        {
            if ( state.ctx ) queu = state.ctx.val.queu;
            else return true;
        }
        else
        {
            queu = state.queu;
        }
        if ( t )
        {
            t = group_replace( t, t_str );
            if ( case_insensitive ) t = t[LOWER]();
            if ( !queu || t !== queu.val[0] ) 
            {
                // no match
                if ( false !== msg )
                {
                    if ( queu )
                    {
                        self.$msg = msg
                            ? group_replace( msg, [queu.val[0],t], true )
                            : 'Mismatched "'+queu.val[0]+'","'+t+'"';
                        err = t_err( self );
                        error_( state, queu.val[1], queu.val[2], queu.val[3], queu.val[4], self, err );
                        error_( state, l1, c1, l2, c2, self, err );
                        queu = queu.prev;
                    }
                    else
                    {
                        self.$msg = msg
                            ? group_replace( msg, ['',t], true )
                            : 'Missing matching "'+t+'"';
                        err = t_err( self );
                        error_( state, l1, c1, l2, c2, self, err );
                    }
                    self.status |= ERROR;
                }
                if ( in_hctx )
                {
                    if ( state.hctx ) state.hctx.val.queu = queu;
                }
                else if ( in_ctx )
                {
                    if ( state.ctx ) state.ctx.val.queu = queu;
                }
                else
                {
                    state.queu = queu;
                }
                return false;
            }
            else
            {
                queu = queu ? queu.prev : null;
            }
        }
        else
        {
            // pop unconditionaly
            queu = queu ? queu.prev : null;
        }
        if ( in_hctx )
        {
            if ( state.hctx ) state.hctx.val.queu = queu;
        }
        else if ( in_ctx )
        {
            if ( state.ctx ) state.ctx.val.queu = queu;
        }
        else
        {
            state.queu = queu;
        }
    }

    else if ( (A_MCHSTART === action) && t )
    {
        if ( in_hctx )
        {
            if ( state.hctx ) queu = state.hctx.val.queu;
            else return true;
        }
        else if ( in_ctx )
        {
            if ( state.ctx ) queu = state.ctx.val.queu;
            else return true;
        }
        else
        {
            queu = state.queu;
        }
        t = group_replace( t, t_str );
        if ( case_insensitive ) t = t[LOWER]();
        self.$msg = msg
            ? group_replace( msg, t, true )
            : 'Missing matching "'+t+'"';
        // used when end-of-file is reached and unmatched tokens exist in the queue
        // to generate error message, if needed, as needed
        queu = new Stack( [t, l1, c1, l2, c2, t_err( self )], queu );
        if ( in_hctx )
        {
            if ( state.hctx ) state.hctx.val.queu = queu;
        }
        else if ( in_ctx )
        {
            if ( state.ctx ) state.ctx.val.queu = queu;
        }
        else
        {
            state.queu = queu;
        }
    }

    /*else if ( A_INDENT === action )
    {
        // TODO
    }

    else if ( A_OUTDENT === action )
    {
        // TODO
    }

    else if ( A_FOLDSTART === action )
    {
        // TODO
    }

    else if ( A_FOLDEND === action )
    {
        // TODO
    }*/

    return true;
}

function t_simple( t, stream, state, token, exception )
{
    var self = t, pattern = self.token, modifier = self.modifier,
        type = self.type, tokenID = self.name, except = self.except, tok_except,
        backup, line = state.line, pos = stream.pos, m = null, ret = false;
    
    self.status &= CLEAR_ERROR;
    self.$msg = exception ? null : (self.msg || null);
    self.pos = stream.pos;
    if ( except && !exception )
    {
        backup = state_backup( state, stream );
        for(var i=0,l=except.length; i<l; i++)
        {
            tok_except = except[i];
            // exceptions are ONLY simple tokens
            if ( self === tok_except || T_SIMPLE !== tok_except.type ) continue;
            // exception matched, backup and fail
            if ( t_simple( tok_except, stream, state, token, 1 ) ) { self.pos = tok_except.pos; state_backup( state, stream, backup ); return false; }
        }
    }
    // match SOF (start-of-file, first line of source)
    if ( T_SOF === type ) { ret = 0 === state.line; }
    // match FNBL (first non-blank line of source)
    else if ( T_FNBL === type ) { ret = state.bline+1 === state.line; }
    // match SOL (start-of-line)
    else if ( T_SOL === type ) { ret = stream.sol(); }
    // match EOL (end-of-line) ( with possible leading spaces )
    else if ( T_EOL === type ) 
    { 
        stream.spc();
        if ( stream.eol() ) ret = tokenID;
        else {self.pos = stream.pos; stream.bck( pos );}
    }
    // match EMPTY token
    else if ( T_EMPTY === type ) { self.status = 0; ret = true; }
    // match non-space
    else if ( T_NONSPACE === type ) 
    { 
        if ( (null != token.space) && !stream.eol() )
        {
            // space is already parsed, take it into account here
            if ( self.status & REQUIRED ) self.status |= ERROR;
        }
        else if ( stream.spc() && !stream.eol() )
        {
            self.pos = stream.pos;
            stream.bck( pos );
            if ( self.status & REQUIRED ) self.status |= ERROR;
        }
        else
        {
            ret = true;
        }
        self.status &= CLEAR_REQUIRED;
        if ( true === ret ) return ret;
    }
    // match up to end-of-line
    else if ( T_NULL === pattern ) 
    { 
        stream.end( ); // skipToEnd
        ret = modifier || tokenID; 
    }
    // else match a simple token
    else if ( m = t_match( pattern, stream ) ) 
    { 
        m = m[ 1 ];
        ret = modifier || tokenID; 
    }
    if ( exception ) return ret;
    if ( false !== ret )
    {
        token.T = type; token.id = tokenID; token.type = ret;
        token.str = stream.sel(pos, stream.pos); token.match = m;
        token.pos = [line, pos, line, stream.pos];
    }
    if ( !ret && self.status && self.$msg ) self.$msg = group_replace( self.$msg, tokenID, true );
    return ret;
}

function t_block( t, stream, state, token )
{
    var self = t, block = self.name, type = self.type, modifier = self.modifier,
        block_start = self.token, block_end,
        is_multiline = self.mline, has_interior = self.inter,
        block_interior = has_interior ? block+'.inside' : block,
        esc_char = self.esc, is_escaped = !!esc_char, is_eol,
        already_inside, found, ended, continued, continue_to_next_line,
        block_start_pos, block_end_pos, block_inside_pos,
        b_start = '', b_inside = '', b_inside_rest = '', b_end = '', b_block,
        char_escaped, next, ret, is_required, $id = self.$id || block, can_be_empty,
        stream_pos, stream_pos0, stack_pos, line, pos, matched,
        outer = state.outer, outerState = outer && outer[2], outerTokenizer = outer && outer[1]
    ;

    /*
        This tokenizer class handles many different block types ( BLOCK, COMMENT, ESC_BLOCK, SINGLE_LINE_BLOCK ),
        having different styles ( DIFFERENT BLOCK DELIMS/INTERIOR ) etc..
        So logic can become somewhat complex,
        descriptive names and logic used here for clarity as far as possible
    */

    self.status &= CLEAR_ERROR;
    self.$msg = self.msg || null;
    self.pos = stream.pos;
    line = state.line; pos = stream.pos;
    // comments are not required tokens
    if ( T_COMMENT === type ) self.status &= CLEAR_REQUIRED;
    
    is_required = self.status & REQUIRED; already_inside = 0; found = 0;
    
    if ( state.block && (state.block.name === block) )
    {
        found = 1; already_inside = 1; ret = block_interior;
        block_end = state.block.end;
        block_start_pos = state.block.sp; block_inside_pos = state.block.ip;  block_end_pos = state.block.ep;
        b_start = state.block.s;  b_inside = state.block.i;
    }    
    else if ( !state.block && (block_end = t_match(block_start, stream)) )
    {
        found = 1; ret = block;
        stream_pos = stream.pos;
        block_start_pos = [line, pos];
        block_inside_pos = [[line, stream_pos], [line, stream_pos]]; block_end_pos = [line, stream_pos];
        b_start = stream.sel(pos, stream_pos);  b_inside = '';  b_end = '';
        state.block = {
            name: block,  end: block_end,
            sp: block_start_pos, ip: block_inside_pos, ep: block_end_pos,
            s: b_start, i: b_inside, e: b_end
        };
    }    

    if ( found )
    {
        stack_pos = state.stack;
        is_eol = T_NULL === block_end.ptype;
        can_be_empty = is_eol || self.empty;
        
        if ( has_interior )
        {
            if ( is_eol && already_inside && stream.sol() )
            {
                // eol block continued to start of next line, abort
                self.status &= CLEAR_REQUIRED;
                state.block = null;
                return false;
            }
            
            if ( !already_inside )
            {
                stream_pos = stream.pos;
                token.T = type; token.id = block; token.type = modifier || ret;
                token.str = stream.sel(pos, stream_pos); token.match = null;
                token.pos = [line, pos, line, stream_pos];
                push_at( state, stack_pos, t_clone( self, is_required, 0, $id ) );
                return modifier || ret;
            }
        }
        
        stream_pos = stream.pos;
        ended = outerTokenizer ? is_eol && stream.eol() : t_match( block_end, stream );
        continue_to_next_line = is_multiline;
        continued = 0;
        
        if ( !ended )
        {
            stream_pos0 = stream.pos;
            char_escaped = false;
            if ( outerTokenizer || is_escaped ||
                (T_CHARLIST !== block_end.ptype && T_CHAR !== block_end.ptype && T_STR !== block_end.ptype)
            )
            {
                while ( !stream.eol( ) ) 
                {
                    // check for outer parser interleaved
                    if ( outerTokenizer )
                    {
                        if ( tokenize( outerTokenizer, stream, outerState, token ) )
                        {
                            if ( stream.pos > stream_pos0 )
                            {
                                // return any part of current block first
                                if ( is_eol ) ended = 1;
                                break;
                            }
                            else
                            {
                                // dispatch back to outer parser (interleaved next)
                                return true;
                            }
                        }
                        else if ( is_eol )
                        {
                            // EOL block, go char-by-char since outerToken might still be inside
                            next = stream.nxt( 1 );
                            b_inside_rest += next;
                            continue;
                        }
                    }
                    stream_pos = stream.pos;
                    if ( !char_escaped && t_match(block_end, stream) ) 
                    {
                        if ( has_interior )
                        {
                            if ( stream.pos > stream_pos && stream_pos > stream_pos0 )
                            {
                                ret = block_interior;
                                stream.bck( stream_pos );
                                continued = 1;
                            }
                            else
                            {
                                ret = block;
                                ended = 1;
                            }
                        }
                        else
                        {
                            ret = block;
                            ended = 1;
                        }
                        b_end = stream.sel(stream_pos, stream.pos);
                        break;
                    }
                    else
                    {
                        next = stream.nxt( 1 );
                        b_inside_rest += next;
                    }
                    char_escaped = is_escaped && !char_escaped && (esc_char === next);
                    stream_pos = stream.pos;
                }
                if ( is_eol && stream.eol() ) ended = 1;
            }
            else
            {
                // non-escaped block, 
                // match at once instead of char-by-char
                if ( matched = t_match(block_end, stream, true, true) )
                {
                    if ( has_interior )
                    {
                        if ( stream.pos > stream_pos+matched[1].length )
                        {
                            ret = block_interior;
                            stream.mov( -matched[1].length );
                            continued = 1;
                            b_inside_rest = stream.sel(stream_pos, stream.pos);
                        }
                        else
                        {
                            ret = block;
                            ended = 1;
                            b_inside_rest = stream.sel(stream_pos, stream.pos-matched[1].length);
                            b_end = matched[1];
                        }
                    }
                    else
                    {
                        ret = block;
                        ended = 1;
                        b_inside_rest = stream.sel(stream_pos, stream.pos-matched[1].length);
                        b_end = matched[1];
                    }
                }
                else
                {
                    // skip to end of line, and continue
                    stream.end( );
                    ret = block_interior;
                    continued = 1;
                    b_inside_rest = stream.sel(stream_pos, stream.pos);
                }
            }
        }
        else
        {
            ret = is_eol ? block_interior : block;
            b_end = stream.sel(stream_pos, stream.pos);
        }
        continue_to_next_line = is_multiline || (is_escaped && char_escaped);
        
        b_inside += b_inside_rest;
        block_inside_pos[ 1 ] = [line, stream_pos]; block_end_pos = [line, stream.pos];
        
        if ( ended )
        {
            // block is empty, invalid block
            if ( !can_be_empty && 
                (block_inside_pos[0][0] === block_inside_pos[1][0]) && 
                (block_inside_pos[0][1] === block_inside_pos[1][1])
            )
            {
                state.block = null;
                return false;
            }
        }
        
        if ( ended || (!continue_to_next_line && !continued) )
        {
            state.block = null;
        }
        else
        {
            state.block.ip = block_inside_pos;  state.block.ep = block_end_pos;
            state.block.i = b_inside; state.block.e = b_end;
            push_at( state, stack_pos, t_clone( self, is_required, 0, $id ) );
        }
        token.T = type; token.id = block; token.type = modifier || ret;
        token.str = stream.sel(pos, stream.pos); token.match = null;
        token.pos = [line, pos, block_end_pos[0], block_end_pos[1]];
        self.pos = stream.pos;
        
        if ( !state.block )
        {
            // block is now completed
            b_block = b_start + b_inside + b_end;
            token.block = {
            str: b_block,
            match: [ b_block, b_inside, b_start, b_end ],
            part: [ b_block, b_start, b_inside, b_end ],
            pos: [
                [block_start_pos[0], block_start_pos[1], block_end_pos[0], block_end_pos[1]],
                [block_start_pos[0], block_start_pos[1], block_inside_pos[0][0], block_inside_pos[0][1]],
                [block_inside_pos[0][0], block_inside_pos[0][1], block_inside_pos[1][0], block_inside_pos[1][1]],
                [block_inside_pos[1][0], block_inside_pos[1][1], block_end_pos[0], block_end_pos[1]]
            ]
            };
        }
        return modifier || ret;
    }
    if ( self.status && self.$msg ) self.$msg = group_replace( self.$msg, block, true );
    return false;
}

function t_composite( t, stream, state, token )
{
    var self = t, type = self.type, name = self.name, tokens = self.token, n = tokens.length,
        token_izer, style, modifier = self.modifier, found, min, max,
        tokens_required, tokens_err, stream_pos, stack_pos,
        i, i0, tt, err, $id, is_sequence, backup;

    self.status &= CLEAR_ERROR;
    self.$msg = self.msg || null;

    stream_pos = stream.pos;
    stack_pos = state.stack;
    self.pos = stream.pos;

    tokens_required = 0; tokens_err = 0;
    
    // TODO: a better error handling and recovery method
    // it should error recover to minimum/closest state
    // i.e generate only the minimum/necessary error notices
    if ( T_SUBGRAMMAR === type )
    {
        self.status &= CLEAR_ERROR;
        var subgrammar = new String(tokens[0]), nextTokenizer = state.stack ? state.stack.val : null;
        subgrammar.subgrammar = 1;
        subgrammar.next = nextTokenizer ? new tokenizer(T_POSITIVE_LOOKAHEAD, nextTokenizer.name, [nextTokenizer]) : null;
        subgrammar.required = nextTokenizer ? nextTokenizer.status & REQUIRED : 0;
        // return the subgrammar id to continue parsing with the subgrammar (if exists)
        return subgrammar;
    }
    
    else if ( T_ALTERNATION === type )
    {
        $id = /*self.$id ||*/ get_id( );
        self.status |= REQUIRED;
        err = [];
        backup = state_backup( state, stream );
        i0 = /*self.i0 ||*/ 0;
        for (i=i0; i<n; i++)
        {
            token_izer = t_clone( tokens[ i ], 1, modifier, $id );
            style = tokenize( token_izer, stream, state, token );
            self.pos = token_izer.pos;
            
            if ( token_izer.status & REQUIRED )
            {
                tokens_required++;
                err.push( t_err( token_izer ) );
            }
            
            if ( false !== style )
            {
                /*if ( (i+1 < n) && (stack.length > stack_pos) )
                {
                    // push it to the stack as well, in case this option is not finaly matched
                    token_izer = t_clone( self, 1, modifier ); token_izer.i0 = i+1; // to try next option
                    token_izer.last_option = stack[stack.length-1];
                    push_at( stack, stack_pos, token_izer );
                    // a way is needed to check if this option finaly matched
                    // using an internal stack can solve this, but how about the global stack?
                }*/
                return style;
            }
            else if ( token_izer.status & ERROR )
            {
                tokens_err++;
                state_backup( state, stream, backup );
            }
        }
        
        if ( tokens_required > 0 ) self.status |= REQUIRED;
        else self.status &= CLEAR_REQUIRED;
        if ( (n === tokens_err) && (tokens_required > 0) ) self.status |= ERROR;
        else self.status &= CLEAR_ERROR;
        if ( self.status && !self.$msg && err.length ) self.$msg = err.join(' | ');
        return false;
    }

    else if ( T_SEQUENCE_OR_NGRAM & type )
    {
        is_sequence = !!(type & T_SEQUENCE);
        $id = self.$id || get_id( );
        if ( is_sequence ) self.status |= REQUIRED;
        else self.status &= CLEAR_REQUIRED;
        backup = state_backup( state, stream );
        i0 = 0;
        do {
        token_izer = t_clone( tokens[ i0++ ], is_sequence, modifier, $id );
        style = tokenize( token_izer, stream, state, token );
        // bypass failed but optional tokens in the sequence
        // or successful lookahead tokens
        // and get to the next ones
        } while (/*is_sequence &&*/ i0 < n && (
            ((true === style) && (T_LOOKAHEAD & token_izer.type)) || 
            ((false === style) && !(token_izer.status & REQUIRED/*_OR_ERROR*/))
        ));
        
        self.pos = token_izer.pos;
        if ( false !== style )
        {
            // not empty token
            if ( (true !== style) || (T_EMPTY !== token_izer.type) )
            {
                for (i=n-1; i>=i0; i--)
                    stack_pos = push_at( state, stack_pos, t_clone( tokens[ i ], 1, modifier, $id ) );
            }
            if ( style.subgrammar /*&& !style.next*/ && (i0 < n) )
            {
                // add the nextTokenizer to subgrammar token, from here
                style.next = new tokenizer(T_POSITIVE_LOOKAHEAD, tokens[i0].name, [tokens[i0]]);
                style.required = tokens[i0].status & REQUIRED;
            }
            return style;
        }
        else if ( token_izer.status & ERROR /*&& token_izer.REQ*/ )
        {
            if ( is_sequence ) self.status |= ERROR;
            else self.status &= CLEAR_ERROR;
            state_backup( state, stream, backup );
        }
        else if ( is_sequence && (token_izer.status & REQUIRED) )
        {
            self.status |= ERROR;
        }
        
        if ( self.status && !self.$msg ) self.$msg = t_err( token_izer );
        return false;
    }

    else if ( T_LOOKAHEAD & type )
    {
        // not supported, return success as default
        if ( T_SUBGRAMMAR & tokens[ 0 ].type ) return true;
        backup = state_backup( state, stream, null, false );
        style = tokenize( t_clone( tokens[ 0 ], 0 ), stream, state, token );
        state_backup( state, stream, backup );
        return T_NEGATIVE_LOOKAHEAD === type ? false === style : false !== style;
    }

    else //if ( T_REPEATED & type )
    {
        $id = self.$id || get_id( );
        found = self.found; min = self.min; max = self.max;
        //self.status &= CLEAR_REQUIRED;
        self.status = 0;
        err = [];
        
        backup = state_backup( state, stream );
        for (i=0; i<n; i++)
        {
            token_izer = t_clone( tokens[ i ], 1, modifier, $id );
            style = tokenize( token_izer, stream, state, token );
            self.pos = token_izer.pos;
            
            if ( false !== style )
            {
                ++found;
                if ( found <= max )
                {
                    // push it to the stack for more
                    self.found = found;
                    push_at( state, stack_pos, t_clone( self, 0, 0, get_id( ) ) );
                    self.found = 0;
                    return style;
                }
                break;
            }
            else if ( token_izer.status & REQUIRED )
            {
                tokens_required++;
                err.push( t_err( token_izer ) );
            }
            if ( token_izer.status & ERROR )
            {
                state_backup( state, stream, backup );
            }
        }
        
        if ( found < min ) self.status |= REQUIRED;
        //else self.status &= CLEAR_REQUIRED;
        if ( (found > max) || (found < min && 0 < tokens_required) ) self.status |= ERROR;
        //else self.status &= CLEAR_ERROR;
        if ( self.status && !self.$msg && err.length ) self.$msg = err.join(' | ');
        return false;
    }
}

