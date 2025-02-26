import codegen
from codegen.sdk.core.codebase import Codebase
# from codegen.sdk.core.statements import IfBlockStatement

@codegen.function("unused-functions")
def run(codebase: Codebase):
    DIR_NAME = 'packages/next/src/client/components/react-dev-overlay'
    directory = codebase.get_directory(DIR_NAME)

    print('hi')
    for file in directory.files(recursive=True):
        for imp in file.inbound_imports:
            if imp.file not in directory:
                if 'require' in imp.import_statement or 'import type' in imp.import_statement:
                    continue
                print(f'Violation: imported at {imp.file.filepath}, link: {imp.github_url}  ⚛️ File: {imp.file.filepath}')

    print('hi - done')

    print(f'Found {len(imports)} imports')


if __name__ == "__main__":
    print('Parsing codebase...')
    codebase = Codebase("./packages/next")
    print('Running...')
    run(codebase)
