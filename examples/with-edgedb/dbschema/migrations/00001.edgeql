CREATE MIGRATION m1gcnribdubi476w7daqzhuxvbutfpiqyhhbm2nyfv3xhzc6z757ia
    ONTO initial
{
  CREATE TYPE default::Post {
      CREATE REQUIRED PROPERTY authorName -> std::str {
          SET default := 'Unknown author';
      };
      CREATE REQUIRED PROPERTY content -> std::str {
          SET default := '';
      };
      CREATE PROPERTY published -> std::datetime;
      CREATE PROPERTY publishedISO := (<std::str>.published);
      CREATE REQUIRED PROPERTY title -> std::str;
  };
};
