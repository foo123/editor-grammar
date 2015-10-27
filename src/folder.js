
function Type( TYPE, positive )
{
    if ( T_STR_OR_ARRAY & get_type( TYPE ) )
        TYPE = new_re( map( make_array( TYPE ).sort( by_length ), esc_re ).join( '|' ) );
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
        end = string.search(Stream.$NONSPC$);
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
        selfClose = lastSlash > -1 && !Stream.$NOTEMPTY$.test(iter.text.slice(lastSlash + 1, gt));
        iter.col = gt + 1;
        return selfClose ? "autoclosed" : "regular";
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

// folder factories
var Folder = {
    // adapted from codemirror
    
     _: {
        $block$: /comment/,
        $comment$: /comment/
    }
    
    ,Indented: function( NOTEMPTY ) {
        NOTEMPTY = NOTEMPTY || Stream.$NOTEMPTY$;
        
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
    
    ,MarkedUp: function( T, L, R, S, M ) {
        T = T || Type(/\btag\b/);
        L = L || "<"; R = R || ">"; S = S || "/";
        M = M || new_re(L+"("+S+"?)([a-zA-Z_][a-zA-Z0-9_\\-:]*)","g");

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

