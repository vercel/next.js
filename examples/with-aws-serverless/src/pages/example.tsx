import React from 'react';
import Head from 'next/head';
import Button from 'src/components/Button';
import LoadingIndicator from 'src/components/LoadingIndicator';
import Avatar from 'src/components/Avatar';

type ApiResponse = { data: any, error: string } | undefined;

export default () => {
  const title: string = 'Example';
  const [apiResponse, setApiResponse] = React.useState<ApiResponse>(undefined);
  const [isFetching, setIsFetching] = React.useState<boolean>(false);
  const handleClick = async () => {
    setIsFetching(true);
    const response = await fetch('/api/v1/users');
    const jsonResponse = await response.json();
    setApiResponse({ data: (apiResponse?.data || []).concat(jsonResponse.data), error: jsonResponse.error });
    setIsFetching(false);
  };

  return (
    <>
      <style jsx={true}>{`
        .example {
          display: flex;
          flex-direction: column;
        }
      `}</style>
      <Head>
        <title>{title}</title>
      </Head>
      <div className={'example'}>
        <h1>{title}</h1>
        <Button name='fetching data' onClick={handleClick}/>
        {isFetching && <LoadingIndicator/>}
        {apiResponse?.data.map((item: UserModel, idx: number) => (
          <Avatar key={idx} data={item}/>
        ))}
      </div>
    </>
  );
};
