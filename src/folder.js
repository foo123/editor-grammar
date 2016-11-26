
function Type( TYPE, positive )
{
    if ( T_STR_OR_ARRAY & get_type( TYPE ) )
        TYPE = new_re( '\\b(' + map( make_array( TYPE ).sort( by_length ), esc_re ).join( '|' ) + ')\\b' );
    return false === positive
    ? function( type ) { return !type || !TYPE.test( type ); }
    : function( type ) { return !!type && TYPE.test( type ); };
}

function next_tag( iter, T, M, L, R, S )
{
    for (;;)
    {
        M.lastIndex = iter.col;
        var found = M.exec( iter.text ), type;
        if ( !found )
        {
            if ( iter.next( ) )
            {
                iter.text = iter.line( iter.row );
                continue;
            }
            else return;
        }
        if ( !T( iter.token(iter.row, found.index+1) ) )
        {
            iter.col = found.index + 1;
            continue;
        }
        iter.col = found.index + found[0].length;
        return found;
    }
}

/*function prev_tag( iter, T, M, L, R, S )
{
    var gt, lastSlash, selfClose, type;
    for (;;)
    {
        gt = iter.col ? iter.text.lastIndexOf( R, iter.col - 1 ) : -1;
        if ( -1 === gt )
        {
            if ( iter.prev( ) )
            {
                iter.text = iter.line( iter.row );
                continue;
            }
            else return;
        }
        if ( !T( iter.token(iter.row, gt + 1) ) )
        {
            iter.col = gt;
            continue;
        }
        lastSlash = iter.text.lastIndexOf( S, gt );
        selfClose = lastSlash > -1 && !Stream.$NOTEMPTY$.test(iter.text.slice(lastSlash + 1, gt));
        iter.col = gt + 1;
        return selfClose ? "selfClose" : "regular";
    }
}*/

function end_tag( iter, T, M, L, R, S )
{
    var gt, lastSlash, selfClose, type;
    for (;;)
    {
        gt = iter.text.indexOf( R, iter.col );
        if ( -1 === gt )
        {
            if ( iter.next( ) )
            {
                iter.text = iter.line(  iter.row );
                continue;
            }
            else return;
        }
        if ( !T( iter.token(iter.row, gt+1) ) )
        {
            iter.col = gt + 1;
            continue;
        }
        lastSlash = iter.text.lastIndexOf( S, gt );
        selfClose = lastSlash > -1 && !Stream.$NOTEMPTY$.test(iter.text.slice(lastSlash + 1, gt));
        iter.col = gt + 1;
        return selfClose ? "autoclosed" : "regular";
    }
}

/*function start_tag( iter, T, M, L, R, S )
{
    var lt;
    for (;;)
    {
        lt = iter.col ? iter.text.lastIndexOf( L, iter.col - 1 ) : -1;
        if ( -1 === lt )
        {
            if ( iter.prev( ) )
            {
                iter.text = iter.line(  iter.row );
                continue;
            }
            else return;
        }
        if ( !T( iter.token(iter.row, lt+1) ) )
        {
            iter.col = lt + 1;
            continue;
        }
        M.lastIndex = lt;
        iter.col = lt + 1;
        var found = M.exec( iter.text );
        if ( found && lt === found.index ) return found;
    }
}*/

function find_match( dir, iter, row, col, tokenType, S, E, T, folding, commentType )
{
    if ( -1 === dir ) // find start
    {
        var depth = 1, firstLine = iter.first(), i, text, tl, pos,
            nextOpen, nextClose, row0, col0, Sl = S.length, El = E.length,
            unconditional = false === tokenType;
        outer0: for (i=row; i>=firstLine; --i)
        {
            text = iter.line( i ); tl = text.length;
            pos = i===row ? col-1 : tl;
            do{
                if ( pos < 0 ) break;
                nextOpen = text.lastIndexOf( S, pos );
                nextClose = text.lastIndexOf( E, pos );
                if ( (0 > nextOpen) && (0 > nextClose) ) break;
                pos = MAX( nextOpen, nextClose );
                // NOTE: token can fail on some lines that continue e.g blocks
                // since the previous line will have ended the block
                // and the position of the new end delimiter will NOT be recognised as in the block
                // FIXED partialy by semantic iunformation about comments, since this occurs mostly in comment delims
                if ( unconditional || commentType || (iter.token(i, pos+1) == tokenType) )
                {
                    if ( pos === nextClose ) ++depth;
                    else if ( 0 === --depth ) { row0 = i; col0 = pos; break outer0; }
                }
                --pos;
            }while(true);
        }
        // found but failed
        if ( (null == row0) || (folding && (row0 === row) && (col0 === col)) ) return false;
        // found
        return [row0, col0, row, col];
    }
    else //if ( 1 === dir ) // find end
    {
        var depth = 1, lastLine = iter.last(), i, text, tl, pos,
            nextOpen, nextClose, row1, col1, Sl = S.length, El = E.length,
            unconditional = false === tokenType;
        outer1: for (i=row; i<=lastLine; ++i)
        {
            text = iter.line( i ); tl = text.length;
            pos = i===row ? col : 0;
            do{
                if ( pos >= tl ) break;
                nextOpen = text.indexOf( S, pos );
                nextClose = text.indexOf( E, pos );
                if ( (0 > nextOpen) && (0 > nextClose) ) break;
                if ( 0 > nextOpen ) nextOpen = tl;
                if ( 0 > nextClose ) nextClose = tl;
                pos = MIN( nextOpen, nextClose );
                // NOTE: token can fail on some lines that continue e.g blocks
                // since the previous line will have ended the block
                // and the position of the new end delimiter will NOT be recognised as in the block
                // FIXED partialy by semantic information about comments, since this occurs mostly in comment delims
                if ( unconditional || commentType || (iter.token(i, pos+1) == tokenType) )
                {
                    if ( pos === nextOpen ) ++depth;
                    else if ( 0 === --depth ) { row1 = i; col1 = pos; break outer1; }
                }
                ++pos;
            }while(true);
        }
        // found but failed
        if ( (null == row1) || (folding && (row === row1) && (col1 === col)) ) return false;
        // found
        return [row, col, row1, col1];
    }
}

// folder factories
var Folder = {
    // adapted from codemirror
    
     Pattern: function( S, E, T ) {
        // TODO
        return function fold_pattern( ){ };
    }
    
    ,Indented: function( NOTEMPTY ) {
        NOTEMPTY = NOTEMPTY || Stream.$NOTEMPTY$;
        
        return function fold_indentation( iter ) {
            var first_line, first_indentation, cur_line, cur_indentation,
                start_line = iter.row, start_pos, last_line_in_fold, end_pos, i, end;
            
            first_line = iter.line( start_line );
            if ( !NOTEMPTY.test( first_line ) ) return;
            first_indentation = iter.indentation( first_line );
            last_line_in_fold = null; start_pos = first_line.length;
            for (i=start_line+1,end=iter.last( ); i<=end; ++i)
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
            if ( last_line_in_fold ) return [start_line, start_pos, last_line_in_fold, end_pos];
            //return false;
        };
    }

    ,Delimited: function( S, E, T, commentType ) {
        if ( !S || !E || !S.length || !E.length ) return function( ){ };
        T = T || TRUE;

        return function fold_delimiter( iter ) {
            var line = iter.row, col = iter.col,
                lineText, startCh, at, pass, found, tokenType;
            
            lineText = iter.line( line );
            for (at=col,pass=0 ;;)
            {
                var found = at<=0 ? -1 : lineText.lastIndexOf( S, at-1 );
                if ( -1 === found )
                {
                    // not found
                    if ( 1 === pass ) return;
                    pass = 1;
                    at = lineText.length;
                    continue;
                }
                // not found
                if ( 1 === pass && found < col ) return;
                if ( T( tokenType = iter.token( line, found+1 ) ) )
                {
                    startCh = found + S.length;
                    break;
                }
                at = found-1;
            }
            // find end match
            return find_match(1, iter, line, startCh, tokenType, S, E, T, true, commentType);
        };
    }
    
    ,MarkedUp: function( T, L, R, S, M ) {
        T = T || TRUE;
        L = L || "<"; R = R || ">"; S = S || "/";
        M = M || new_re( esc_re(L) + "(" + esc_re(S) + "?)([a-zA-Z_\\-][a-zA-Z0-9_\\-:]*)", {g:1} );

        return function fold_markup( iter ) {
            iter.col = 0; iter.min = iter.first( ); iter.max = iter.last( );
            iter.text = iter.line( iter.row );
            var openTag, end, start, close, tagName, startLine = iter.row,
                stack, next, startCh, i;
            for (;;)
            {
                openTag = next_tag(iter, T, M, L, R, S);
                // not found
                if ( !openTag || iter.row !== startLine || !(end = end_tag(iter, T, M, L, R, S)) ) return;
                if ( !openTag[1] && "autoclosed" !== end  )
                {
                    start = [iter.row, iter.col]; tagName = openTag[2]; close = null;
                    // start find_matching_close
                    stack = [];
                    for (;;)
                    {
                        next = next_tag(iter, T, M, L, R, S);
                        startLine = iter.row; startCh = iter.col - (next ? next[0].length : 0);
                        // found but failed
                        if ( !next || !(end = end_tag(iter, T, M, L, R, S)) ) return false;
                        if ( "autoclosed" === end  ) continue;
                        if ( next[1] )
                        {
                            // closing tag
                            for (i=stack.length-1; i>=0; --i)
                            {
                                if ( stack[i] === next[2] )
                                {
                                    stack.length = i;
                                    break;
                                }
                            }
                            if ( i < 0 && (!tagName || tagName === next[2]) )
                            {
                                /*close = {
                                    tag: next[2],
                                    pos: [startLine, startCh, iter.row, iter.col]
                                };
                                break;*/
                                // found
                                return [start[0], start[1], startLine, startCh];
                            }
                        }
                        else
                        {
                            // opening tag
                            stack.push( next[2] );
                        }
                    }
                    // end find_matching_close
                    /*if ( close )
                    {
                        return [start[0], start[1], close.pos[0], close.pos[1]];
                    }*/
                }
            }
        };
    }

};


// token matching factories
var Matcher = {
    // adapted from ace
    
     Pattern: function( S, E, T ) {
        // TODO
        return function( ){ };
    }
    
     ,Delimited: function( S, E, T, commentType ) {
        if ( !S || !E || !S.length || !E.length ) return function( ){ };
        T = T || TRUE;
        
        return function( iter ) {
            var col = iter.col, row = iter.row, line = iter.line( row ),
                range, tokenType=false, Sl = S.length, El = E.length;
            if ( (col >= Sl) && 
                ((1 === Sl && S === line.charAt(col-1)) || (S === line.slice(col-Sl, col))) /*&& 
                T( tokenType = iter.token( row, col-Sl ) )*/
            )
            {
                // find end
                range = find_match(1, iter, row, col, tokenType, S, E, T, false, commentType);
                if ( range )
                {
                    range = [range[0], range[1]-Sl, range[0], range[1], range[2], range[3], range[2], range[3]+El];
                    range.match = 'end';
                }
                else
                {
                    range = [row, col-Sl, row, col];
                    range.match = false;
                }
                return range;
            }
            else if ( (col >= El) && 
                ((1 === El && E === line.charAt(col-1)) || (E === line.slice(col-El, col))) /*&& 
                T( tokenType = iter.token( row, col-El ) )*/
            )
            {
                // find start
                range = find_match(-1, iter, row, col-El, tokenType, S, E, T, false, commentType);
                if ( range )
                {
                    range = [range[0], range[1], range[0], range[1]+Sl, range[2], range[3], range[2], range[3]+El];
                    range.match = 'start';
                }
                else
                {
                    range = [row, col-El, row, col];
                    range.match = false;
                }
                return range;
            }
            // not found
        };
    }
    
    ,MarkedUp: function( T, L, R, S, M ) {
        // TODO
        return function( ){ };
    }
     
};
