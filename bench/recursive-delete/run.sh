# Uses https://github.com/divmain/fuzzponent
mkdir fixtures-1
cd fixtures-1
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "rimraf 1"
node rimraf.js 1

mkdir fixtures-2
cd fixtures-2
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "rimraf 2"
node rimraf.js 2

mkdir fixtures-3
cd fixtures-3
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "rimraf 3"
node rimraf.js 3

mkdir fixtures-4
cd fixtures-4
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "rimraf 4"
node rimraf.js 4

mkdir fixtures-5
cd fixtures-5
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "rimraf 5"
node rimraf.js 5

echo "-----------"

cd fixtures-1
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "recursive delete 1"
node recursive-delete.js 1

cd fixtures-2
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "recursive delete 2"
node recursive-delete.js 2

cd fixtures-3
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "recursive delete 3"
node recursive-delete.js 3

cd fixtures-4
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "recursive delete 4"
node recursive-delete.js 4

cd fixtures-5
fuzzponent -d 2 -s 20 > output.txt
cd ..
echo "recursive delete 5"
node recursive-delete.js 5

rm -r fixtures-1 fixtures-2 fixtures-3 fixtures-4 fixtures-5