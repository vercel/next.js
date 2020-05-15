import React from 'react';

type Props = {
  data: UserModel;
};

const Avatar = (props: Props) => {
  return (
    <>
      <style jsx={true}>{`
        .avatar {
          display: flex;
          margin-top: 10px;
          align-items: center;
        }
        img {
          width: 50px;
          margin-right: 10px;
        }
        p {
          padding: 0;
          margin: 0;
          border: 0;
        }
      `}</style>
      <div className='avatar'>
        <img src={props.data.photo} alt={props.data.name}/>
        <div className='avatar__text'>
          <p>name : {props.data.name}</p>
          <p>email : {props.data.email}</p>
        </div>
      </div>
    </>
  );
};

export default Avatar;
