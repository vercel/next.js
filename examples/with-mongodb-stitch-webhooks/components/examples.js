import React, {Component} from 'react';
import { connect,  } from 'react-redux';
import {getUsers} from "../actions/db-actions";
import {readFile, postFile} from '../actions/s3-actions';
import {bindActionCreators} from "redux";
import 'isomorphic-unfetch';

class Examples extends Component {
    constructor(props) {
        super(props);
        this.onFormSubmit = this.onFormSubmit.bind(this);
        this.onChange = this.onChange.bind(this);
    }

    onFormSubmit(e){
        e.preventDefault();
        this.props.postFile();
    }

    onChange(e) {
        const uploadedFile = e.target.files[0];
        var reader  = new FileReader();
        reader.addEventListener("load", () => {
            const base64Image = reader.result.split('base64,')[1];
            this.props.readFile({
                fileContent: base64Image,
                fileName: uploadedFile.name,
                fileType: uploadedFile.type,
                bucket: process.env.AWS_S3_BUCKET
            });
        }, false);

        if (e.target.files[0]) {
            reader.readAsDataURL(e.target.files[0]);
        }
    }

    render() {
        return (
            <div>
                <form onSubmit={this.onFormSubmit}>
                    <h1>File Upload</h1>
                    <input type="file" onChange={this.onChange} />
                    <button type="submit">Upload</button>
                </form>
                <button onClick={() => this.props.getUsers()}>Get users</button>
                <p>{this.props.users}</p>
            </div>
        )
    }
}

function mapStateToProps(state) {
    const {users} = state.dbclient;
    return {users}
}


function mapDispatchToProps(dispatch) {
    return bindActionCreators(
        {
            getUsers,
            readFile,
            postFile
        },
        dispatch
    );
}

export default connect(mapStateToProps, mapDispatchToProps)(Examples)
