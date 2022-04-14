module default {  
  
  type Post {
    required property title -> str;
    required property content -> str { default := '' };
    required property authorName -> str { default := 'Unknown author' };
    property published -> datetime;
    property publishedISO := <str>.published;
  }

}